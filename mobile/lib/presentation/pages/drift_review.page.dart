import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/review/review_bottom_bar.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_details_sheet.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_favorite_button.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_similar.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_strip.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_swipe_card.widget.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/providers/review/review.provider.dart';
import 'package:immich_mobile/providers/review/review.state.dart';
import 'package:immich_mobile/providers/tab.provider.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/widgets/common/immich_toast.dart';

/// Review of the assets pending review: decide Keep or Delete for each, then finish.
@RoutePage()
class DriftReviewPage extends ConsumerWidget {
  const DriftReviewPage({super.key});

  static String _errorMessage(ReviewErrorKind kind) => switch (kind) {
    ReviewErrorKind.load => 'pending_review_error_load',
    ReviewErrorKind.decide => 'pending_review_error_decide',
    ReviewErrorKind.edit => 'pending_review_error_edit',
    ReviewErrorKind.finish => 'pending_review_error_finish',
  };

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.listen<ReviewErrorEvent?>(reviewProvider.select((state) => state.error), (_, event) {
      if (event == null) {
        return;
      }
      ImmichToast.show(
        context: context,
        msg: _errorMessage(event.kind).t(context: context),
        toastType: ToastType.error,
      );
    });

    final state = ref.watch(reviewProvider);

    return Scaffold(
      appBar: AppBar(title: Text('pending_review'.t(context: context))),
      body: SafeArea(child: _ReviewBody(state: state)),
    );
  }
}

class _ReviewBody extends ConsumerStatefulWidget {
  const _ReviewBody({required this.state});

  final ReviewState state;

  @override
  ConsumerState<_ReviewBody> createState() => _ReviewBodyState();
}

class _ReviewBodyState extends ConsumerState<_ReviewBody> {
  ReviewNotifier get _notifier => ref.read(reviewProvider.notifier);

  /// Set when a thumbnail is tapped once everything is decided, so the card shows for a change of
  /// mind instead of the Finish panel. Cleared by the next decision or skip.
  bool _revisiting = false;

  /// Set once Finish succeeded, so the emptied list does not flash the empty state on the way out.
  bool _finished = false;

  /// Set while a sheet, viewer or player is open over the card, so left/right swipes cannot
  /// decide behind it.
  bool _overlayOpen = false;

  void _decide(PendingDecision decision) {
    setState(() => _revisiting = false);
    unawaited(_notifier.decide(decision));
  }

  void _skip() {
    setState(() => _revisiting = false);
    _notifier.skip();
  }

  void _undo() {
    unawaited(_notifier.undo());
  }

  void _jumpTo(int index) {
    setState(() => _revisiting = true);
    _notifier.jumpTo(index);
  }

  Future<void> _finish() async {
    final state = widget.state;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) => _FinishConfirmDialog(keepCount: state.keepCount, deleteCount: state.deleteCount),
    );
    if (confirmed != true || !mounted) {
      return;
    }

    final result = await _notifier.finish();
    if (result == null || !mounted) {
      return;
    }
    setState(() => _finished = true);

    ImmichToast.show(
      context: context,
      msg: 'pending_review_finished'.t(context: context, args: {'kept': result.kept, 'deleted': result.deleted}),
      toastType: ToastType.success,
    );
    // Kept assets reach the timeline through the normal remote sync.
    unawaited(ref.read(backgroundSyncProvider).syncRemote());

    final router = context.router;
    final tab = ref.read(tabProvider.notifier);
    router.popUntilRouteWithName(TabShellRoute.name);
    await router.navigate(const TabShellRoute(children: [MainTimelineRoute()]));
    tab.state = TabEnum.home;
  }

  /// Swipe up on the card opens the review details sheet for the current image.
  Future<void> _onSwipeUp() async {
    final current = widget.state.current;
    if (current == null) {
      return;
    }
    await _withOverlay(() => showReviewDetailsSheet(context, current.assetId));
  }

  /// The look-alike pill opens a sheet of library thumbnails; a tapped one opens full screen.
  Future<void> _onSimilarTap(List<ReviewSimilarAsset> similar) async {
    await _withOverlay(() async {
      final assetId = await showReviewSimilarSheet(context, similar);
      if (assetId == null || !mounted) {
        return;
      }
      await openReviewLibraryAsset(context, ref, assetId);
    });
  }

  /// Runs [open] with swipes disabled until it completes. Ignored while another overlay is open.
  Future<void> _withOverlay(Future<void> Function() open) async {
    if (_overlayOpen) {
      return;
    }
    setState(() => _overlayOpen = true);
    try {
      await open();
    } finally {
      if (mounted) {
        setState(() => _overlayOpen = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = widget.state;

    if (_finished || (state.isLoading && state.items.isEmpty)) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.loadError != null && state.items.isEmpty) {
      return _ReviewMessage(
        icon: Icons.cloud_off_rounded,
        message: 'pending_review_error_load'.t(context: context),
        action: TextButton(
          onPressed: () => _notifier.reload(),
          child: Text('refresh'.t(context: context)),
        ),
      );
    }

    if (state.items.isEmpty) {
      return _ReviewMessage(
        icon: Icons.task_alt_rounded,
        message: 'pending_review_empty'.t(context: context),
      );
    }

    final current = state.current;
    final showFinish = state.canFinish && !_revisiting;
    final canAct = current != null && !state.isFinishing && !showFinish;

    return Column(
      children: [
        ReviewStrip(items: state.items, currentIndex: state.index, onTap: _jumpTo),
        Padding(
          padding: const EdgeInsets.only(top: 4),
          child: Text(
            'pending_review_decided_count'.t(
              context: context,
              args: {'decided': state.decidedCount, 'total': state.total},
            ),
            style: context.textTheme.labelLarge?.copyWith(color: context.colorScheme.onSurfaceVariant),
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: showFinish
                ? _FinishPanel(isFinishing: state.isFinishing, onFinish: _finish)
                : current == null
                ? const SizedBox.shrink()
                : ReviewSwipeCard(
                    key: ValueKey(current.assetId),
                    assetId: current.assetId,
                    swipeEnabled: canAct && !_overlayOpen,
                    onDecide: _decide,
                    onSwipeUp: _onSwipeUp,
                    overlays: [
                      Positioned(top: 8, right: 8, child: ReviewFavoriteButton(assetId: current.assetId)),
                      Positioned(
                        left: 8,
                        bottom: 8,
                        child: ReviewSimilarPill(assetId: current.assetId, onTap: _onSimilarTap),
                      ),
                    ],
                  ),
          ),
        ),
        ReviewBottomBar(
          onDelete: canAct ? () => _decide(PendingDecision.delete) : null,
          onUndo: state.canUndo && !state.isFinishing ? _undo : null,
          onSkip: canAct ? _skip : null,
          onKeep: canAct ? () => _decide(PendingDecision.keep) : null,
        ),
      ],
    );
  }
}

class _ReviewMessage extends StatelessWidget {
  const _ReviewMessage({required this.icon, required this.message, this.action});

  final IconData icon;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 56, color: context.colorScheme.onSurfaceVariant),
            const SizedBox(height: 16),
            Text(message, textAlign: TextAlign.center, style: context.textTheme.titleMedium),
            if (action != null) ...[const SizedBox(height: 12), action!],
          ],
        ),
      ),
    );
  }
}

class _FinishPanel extends StatelessWidget {
  const _FinishPanel({required this.isFinishing, required this.onFinish});

  final bool isFinishing;
  final VoidCallback onFinish;

  @override
  Widget build(BuildContext context) {
    if (isFinishing) {
      return _ReviewMessage(
        icon: Icons.hourglass_top_rounded,
        message: 'pending_review_finishing'.t(context: context),
        action: const Padding(padding: EdgeInsets.only(top: 8), child: CircularProgressIndicator()),
      );
    }
    return _ReviewMessage(
      icon: Icons.task_alt_rounded,
      message: 'pending_review_all_decided'.t(context: context),
      action: FilledButton.icon(
        onPressed: onFinish,
        icon: const Icon(Icons.done_all_rounded),
        label: Text('pending_review_finish'.t(context: context)),
      ),
    );
  }
}

class _FinishConfirmDialog extends StatelessWidget {
  const _FinishConfirmDialog({required this.keepCount, required this.deleteCount});

  final int keepCount;
  final int deleteCount;

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.all(Radius.circular(10))),
      title: Text('pending_review_finish'.t(context: context)),
      content: Text(
        'pending_review_finish_confirm'.t(context: context, args: {'keep': keepCount, 'delete': deleteCount}),
      ),
      actions: [
        TextButton(
          onPressed: () => Navigator.of(context).pop(false),
          child: Text(
            'cancel'.t(context: context),
            style: TextStyle(color: context.primaryColor, fontWeight: FontWeight.bold),
          ),
        ),
        TextButton(
          onPressed: () => Navigator.of(context).pop(true),
          child: Text(
            'pending_review_finish'.t(context: context),
            style: TextStyle(color: context.colorScheme.error, fontWeight: FontWeight.bold),
          ),
        ),
      ],
    );
  }
}
