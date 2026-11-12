import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:openapi/api.dart' show AssetResponseDto;

/// The index to move to after a decision or a skip: the next undecided item after [from], wrapping
/// round to the start. Falls back to the next item along when nothing else is undecided, and to
/// [from] itself when it is the last item.
int nextUndecidedIndex(List<ReviewItem> items, int from) {
  final count = items.length;
  if (count == 0) {
    return 0;
  }
  for (var step = 1; step < count; step++) {
    final index = (from + step) % count;
    if (items[index].isUndecided) {
      return index;
    }
  }
  return (from + 1).clamp(0, count - 1);
}

/// The first undecided item, or the first item when everything is decided.
int firstUndecidedIndex(List<ReviewItem> items) {
  final index = items.indexWhere((item) => item.isUndecided);
  return index < 0 ? 0 : index;
}

/// One step the user can take back with Undo.
sealed class ReviewUndoEntry {
  final String assetId;

  const ReviewUndoEntry(this.assetId);
}

/// A decision was set on [assetId]; undoing restores [previous].
final class ReviewDecisionUndo extends ReviewUndoEntry {
  final PendingDecision previous;
  final PendingDecision applied;

  const ReviewDecisionUndo(super.assetId, {required this.previous, required this.applied});
}

/// [assetId] was skipped; undoing returns to it.
final class ReviewSkipUndo extends ReviewUndoEntry {
  const ReviewSkipUndo(super.assetId);
}

enum ReviewErrorKind { load, decide, edit, finish }

/// A failure the screen should report once (e.g. as a toast). Each failure is a new instance, so a
/// listener can react to every one even when two in a row look alike.
class ReviewErrorEvent {
  final ReviewErrorKind kind;
  final Object error;

  ReviewErrorEvent(this.kind, this.error);

  @override
  String toString() => 'ReviewErrorEvent($kind, $error)';
}

/// Everything the review screen shows. Transitions are pure and return a new state, so the
/// navigation, undo and decision bookkeeping can be tested without the server.
class ReviewState {
  /// Every pending asset, in upload order.
  final List<ReviewItem> items;
  final int index;

  /// Decisions and skips, most recent last. Lives as long as the screen.
  final List<ReviewUndoEntry> history;

  final bool isLoading;
  final bool isFinishing;
  final Object? loadError;

  /// `GET /assets/:id` results, cached for the visit.
  final Map<String, AssetResponseDto> assets;

  /// Library look-alikes, cached for the visit. A key with an empty list was asked and had none.
  final Map<String, List<ReviewSimilarAsset>> similar;

  /// The latest failure to report; see [ReviewErrorEvent].
  final ReviewErrorEvent? error;

  const ReviewState({
    this.items = const [],
    this.index = 0,
    this.history = const [],
    this.isLoading = false,
    this.isFinishing = false,
    this.loadError,
    this.assets = const {},
    this.similar = const {},
    this.error,
  });

  ReviewItem? get current => index >= 0 && index < items.length ? items[index] : null;

  int get total => items.length;
  int get keepCount => items.where((item) => item.decision == PendingDecision.keep).length;
  int get deleteCount => items.where((item) => item.decision == PendingDecision.delete).length;
  int get decidedCount => keepCount + deleteCount;
  int get undecidedCount => total - decidedCount;

  /// Whether Finish review is available: something is pending and nothing is undecided.
  bool get canFinish => total > 0 && undecidedCount == 0;

  bool get canUndo => history.isNotEmpty;

  ReviewItem? itemFor(String assetId) => items.where((item) => item.assetId == assetId).firstOrNull;

  int indexOf(String assetId) => items.indexWhere((item) => item.assetId == assetId);

  ReviewState copyWith({
    List<ReviewItem>? items,
    int? index,
    List<ReviewUndoEntry>? history,
    bool? isLoading,
    bool? isFinishing,
    Object? loadError,
    bool clearLoadError = false,
    Map<String, AssetResponseDto>? assets,
    Map<String, List<ReviewSimilarAsset>>? similar,
    ReviewErrorEvent? error,
  }) => ReviewState(
    items: items ?? this.items,
    index: index ?? this.index,
    history: history ?? this.history,
    isLoading: isLoading ?? this.isLoading,
    isFinishing: isFinishing ?? this.isFinishing,
    loadError: clearLoadError ? null : (loadError ?? this.loadError),
    assets: assets ?? this.assets,
    similar: similar ?? this.similar,
    error: error ?? this.error,
  );

  /// Replace the item for [assetId] with what [update] returns. Unknown ids leave the state as is.
  ReviewState updateItem(String assetId, ReviewItem Function(ReviewItem item) update) {
    final position = indexOf(assetId);
    if (position < 0) {
      return this;
    }
    final updated = [...items];
    updated[position] = update(items[position]);
    return copyWith(items: List.unmodifiable(updated));
  }

  /// Load a fresh list from the server, staying on the same asset when it is still pending.
  ReviewState withItems(List<ReviewItem> fresh) {
    final assetId = current?.assetId;
    final position = assetId == null ? -1 : fresh.indexWhere((item) => item.assetId == assetId);
    return copyWith(
      items: List.unmodifiable(fresh),
      index: position < 0 ? firstUndecidedIndex(fresh) : position,
      isLoading: false,
      clearLoadError: true,
    );
  }

  /// Mark the current item and move on to the next undecided one.
  ReviewState decided(PendingDecision decision) {
    final item = current;
    if (item == null) {
      return this;
    }
    final next = updateItem(item.assetId, (item) => item.copyWith(decision: decision));
    return next.copyWith(
      index: nextUndecidedIndex(next.items, index),
      history: List.unmodifiable([
        ...history,
        ReviewDecisionUndo(item.assetId, previous: item.decision, applied: decision),
      ]),
    );
  }

  /// Leave the current item undecided and move on to the next undecided one.
  ReviewState skipped() {
    final item = current;
    if (item == null) {
      return this;
    }
    return copyWith(
      index: nextUndecidedIndex(items, index),
      history: List.unmodifiable([...history, ReviewSkipUndo(item.assetId)]),
    );
  }

  /// Take back the last decision or skip and return to its item. An entry whose asset is no longer
  /// pending is dropped without moving.
  ReviewState undone() {
    if (history.isEmpty) {
      return this;
    }
    final entry = history.last;
    final popped = copyWith(history: List.unmodifiable(history.sublist(0, history.length - 1)));
    final position = indexOf(entry.assetId);
    if (position < 0) {
      return popped;
    }
    final moved = popped.copyWith(index: position);
    return switch (entry) {
      ReviewDecisionUndo(:final previous) => moved.updateItem(
        entry.assetId,
        (item) => item.copyWith(decision: previous),
      ),
      ReviewSkipUndo() => moved,
    };
  }

  ReviewState jumpedTo(int target) => items.isEmpty ? this : copyWith(index: target.clamp(0, items.length - 1));

  ReviewState withoutHistoryEntry(ReviewUndoEntry entry) =>
      copyWith(history: List.unmodifiable(history.where((candidate) => !identical(candidate, entry))));

  ReviewState withHistoryEntry(ReviewUndoEntry entry) => copyWith(history: List.unmodifiable([...history, entry]));
}
