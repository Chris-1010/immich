import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
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

class _ReviewBody extends ConsumerWidget {
  const _ReviewBody({required this.state});

  final ReviewState state;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (state.isLoading && state.items.isEmpty) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.loadError != null && state.items.isEmpty) {
      return _ReviewMessage(
        icon: Icons.cloud_off_rounded,
        message: 'pending_review_error_load'.t(context: context),
        action: TextButton(
          onPressed: () => ref.read(reviewProvider.notifier).reload(),
          child: Text('refresh'.t(context: context)),
        ),
      );
    }

    return const SizedBox.shrink();
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
