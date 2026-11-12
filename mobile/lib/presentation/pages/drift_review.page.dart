import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/review/review_bottom_bar.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_strip.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_swipe_card.widget.dart';
import 'package:immich_mobile/providers/review/review.provider.dart';
import 'package:immich_mobile/providers/review/review.state.dart';
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

  void _decide(PendingDecision decision) {
    unawaited(_notifier.decide(decision));
  }

  void _skip() {
    _notifier.skip();
  }

  void _undo() {
    unawaited(_notifier.undo());
  }

  void _jumpTo(int index) {
    _notifier.jumpTo(index);
  }

  /// Swipe up on the card. Reserved for the review details sheet.
  void _onSwipeUp() {}

  @override
  Widget build(BuildContext context) {
    final state = widget.state;

    if (state.isLoading && state.items.isEmpty) {
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
    final canAct = current != null && !state.isFinishing;

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
            child: current == null
                ? const SizedBox.shrink()
                : ReviewSwipeCard(
                    key: ValueKey(current.assetId),
                    assetId: current.assetId,
                    swipeEnabled: canAct,
                    onDecide: _decide,
                    onSwipeUp: _onSwipeUp,
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
