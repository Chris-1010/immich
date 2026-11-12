import 'dart:async';

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/providers/review/review.state.dart';
import 'package:immich_mobile/repositories/review_api.repository.dart';
import 'package:logging/logging.dart';
import 'package:openapi/api.dart' show AssetResponseDto;

/// How many assets are pending review, for the Library entry row. Read once per watch; invalidate
/// it to ask again. Any failure (including a server without review support) reads as none.
final reviewPendingCountProvider = FutureProvider.autoDispose<int>((ref) async {
  try {
    final items = await ref.watch(reviewApiRepositoryProvider).getItems();
    return items.length;
  } catch (_) {
    return 0;
  }
});

/// State of the review screen. Disposed with the screen, which also drops the undo history and
/// the per-asset caches, so each visit starts fresh.
final reviewProvider = NotifierProvider.autoDispose<ReviewNotifier, ReviewState>(ReviewNotifier.new);

class ReviewNotifier extends AutoDisposeNotifier<ReviewState> {
  static final _log = Logger('ReviewNotifier');

  ReviewApiRepository get _repository => ref.read(reviewApiRepositoryProvider);

  // Write counters per asset, one per field, so a reply or a rollback from an older write never
  // overwrites a newer local change.
  final _decisionWrites = <String, int>{};
  final _editWrites = <String, int>{};

  final _assetRequests = <String, Future<AssetResponseDto?>>{};
  final _similarRequested = <String>{};

  bool _disposed = false;
  bool _finished = false;

  @override
  ReviewState build() {
    ref.onDispose(() => _disposed = true);
    // Deferred so the first state is in place before the load can touch it.
    unawaited(Future.microtask(_load));
    return const ReviewState(isLoading: true);
  }

  void _set(ReviewState next) {
    if (_disposed) {
      return;
    }
    final before = state.current?.assetId;
    state = next;
    final after = next.current?.assetId;
    if (after != null && after != before) {
      _prefetch(after);
    }
  }

  void _report(ReviewErrorKind kind, Object error, [StackTrace? stack]) {
    _log.warning('Review $kind failed', error, stack);
    _set(state.copyWith(error: ReviewErrorEvent(kind, error)));
  }

  /// Fetch details and look-alikes for the asset being shown. Only a change of asset calls this,
  /// never the arrival of the results themselves.
  void _prefetch(String assetId) {
    unawaited(loadAsset(assetId));
    unawaited(loadSimilar(assetId));
  }

  Future<void> _load() async {
    try {
      final items = await _repository.getItems();
      _set(state.withItems(items));
    } catch (error, stack) {
      if (_disposed) {
        return;
      }
      _set(state.copyWith(isLoading: false, loadError: error));
      _report(ReviewErrorKind.load, error, stack);
    }
  }

  /// Ask the server for the pending list again, staying on the current asset if it is still there.
  Future<void> reload() async {
    _set(state.copyWith(isLoading: true));
    await _load();
  }

  /// Mark the current asset and move to the next undecided one. Optimistic: on failure the
  /// decision is rolled back, its undo entry dropped and an error reported.
  Future<void> decide(PendingDecision decision) async {
    final item = state.current;
    if (item == null || state.isFinishing) {
      return;
    }
    _set(state.decided(decision));
    final entry = state.history.last;
    await _writeDecision(
      item.assetId,
      decision,
      rollbackTo: item.decision,
      onFailed: () => _set(state.withoutHistoryEntry(entry)),
    );
  }

  /// Leave the current asset undecided and move to the next undecided one.
  void skip() {
    if (state.isFinishing) {
      return;
    }
    _set(state.skipped());
  }

  /// Take back the last decision or skip and return to its asset. A failed write puts the
  /// decision and the undo entry back as they were.
  Future<void> undo() async {
    if (!state.canUndo || state.isFinishing) {
      return;
    }
    final entry = state.history.last;
    final before = state.itemFor(entry.assetId)?.decision;
    _set(state.undone());
    if (entry is ReviewDecisionUndo && before != null && before != entry.previous) {
      await _writeDecision(
        entry.assetId,
        entry.previous,
        rollbackTo: before,
        onFailed: () => _set(state.withHistoryEntry(entry)),
      );
    }
  }

  /// Show the asset at [index] (e.g. a tap on the strip). Not recorded for undo.
  void jumpTo(int index) => _set(state.jumpedTo(index));

  Future<void> _writeDecision(
    String assetId,
    PendingDecision decision, {
    required PendingDecision rollbackTo,
    required void Function() onFailed,
  }) async {
    final token = (_decisionWrites[assetId] ?? 0) + 1;
    _decisionWrites[assetId] = token;
    bool isLatest() => !_finished && _decisionWrites[assetId] == token;

    try {
      final updated = await _repository.update(assetId, decision: decision);
      if (isLatest()) {
        _set(state.updateItem(assetId, (item) => item.copyWith(decision: updated.decision)));
      }
    } catch (error, stack) {
      if (_finished) {
        return;
      }
      if (isLatest()) {
        _set(state.updateItem(assetId, (item) => item.copyWith(decision: rollbackTo)));
        onFailed();
      }
      _report(ReviewErrorKind.decide, error, stack);
    }
  }

  /// Merge [patch] into the asset's staged edits and save the full merged set. Fields the patch
  /// does not mention (albums or people staged elsewhere, for example) are kept. Optimistic: on
  /// failure the previous edits come back and an error is reported.
  Future<void> stageEdits(String assetId, ReviewEditsPatch patch) async {
    final item = state.itemFor(assetId);
    if (item == null || state.isFinishing) {
      return;
    }
    final previous = item.edits;
    final merged = previous.merge(patch);
    if (merged == previous) {
      return;
    }
    _set(state.updateItem(assetId, (item) => item.copyWith(edits: merged)));

    final token = (_editWrites[assetId] ?? 0) + 1;
    _editWrites[assetId] = token;
    bool isLatest() => !_finished && _editWrites[assetId] == token;

    try {
      final updated = await _repository.update(assetId, edits: merged);
      if (isLatest()) {
        _set(state.updateItem(assetId, (item) => item.copyWith(edits: updated.edits)));
      }
    } catch (error, stack) {
      if (_finished) {
        return;
      }
      if (isLatest()) {
        _set(state.updateItem(assetId, (item) => item.copyWith(edits: previous)));
      }
      _report(ReviewErrorKind.edit, error, stack);
    }
  }

  /// Full details of a pending asset, fetched once per visit. Returns null on failure; a later
  /// call tries again.
  Future<AssetResponseDto?> loadAsset(String assetId) {
    final cached = state.assets[assetId];
    if (cached != null) {
      return Future.value(cached);
    }
    final pending = _assetRequests[assetId];
    if (pending != null) {
      return pending;
    }
    final request = _fetchAsset(assetId);
    _assetRequests[assetId] = request;
    // Forget a failed request so the next call asks again.
    unawaited(
      request.then((asset) {
        if (asset == null && identical(_assetRequests[assetId], request)) {
          _assetRequests.remove(assetId);
        }
      }),
    );
    return request;
  }

  Future<AssetResponseDto?> _fetchAsset(String assetId) async {
    try {
      final asset = await _repository.getAssetInfo(assetId);
      if (!_finished && state.itemFor(assetId) != null) {
        _set(state.copyWith(assets: {...state.assets, assetId: asset}));
      }
      return asset;
    } catch (error, stack) {
      _log.warning('Could not load pending asset $assetId', error, stack);
      return null;
    }
  }

  /// Ask for library look-alikes of [assetId], at most once per visit. The hint is optional, so
  /// failures are swallowed (and not retried).
  Future<void> loadSimilar(String assetId) async {
    if (_finished || !_similarRequested.add(assetId)) {
      return;
    }
    try {
      final matches = await _repository.getSimilar(assetId);
      if (!_finished && state.itemFor(assetId) != null) {
        _set(state.copyWith(similar: {...state.similar, assetId: List.unmodifiable(matches)}));
      }
    } catch (error) {
      _log.fine('No look-alikes for $assetId', error);
    }
  }

  /// Commit every decision. On success the item list is cleared first, then the per-asset caches,
  /// and the result is returned. On failure the list is reloaded, the error reported and null
  /// returned.
  Future<ReviewFinishResult?> finish() async {
    if (state.isFinishing) {
      return null;
    }
    _set(state.copyWith(isFinishing: true));
    try {
      final result = await _repository.finish();
      _finished = true;
      _set(state.copyWith(items: const [], index: 0, history: const []));
      _assetRequests.clear();
      _similarRequested.clear();
      _set(state.copyWith(assets: const {}, similar: const {}, isFinishing: false));
      ref.invalidate(reviewPendingCountProvider);
      return result;
    } catch (error, stack) {
      _set(state.copyWith(isFinishing: false));
      _report(ReviewErrorKind.finish, error, stack);
      await reload();
      return null;
    }
  }
}
