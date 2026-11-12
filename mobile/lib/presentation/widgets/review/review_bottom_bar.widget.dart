import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/review/review_swipe_card.widget.dart';

/// Delete, Undo, Skip and Keep under the review card. A null callback disables its button.
class ReviewBottomBar extends StatelessWidget {
  const ReviewBottomBar({super.key, this.onDelete, this.onUndo, this.onSkip, this.onKeep});

  final VoidCallback? onDelete;
  final VoidCallback? onUndo;
  final VoidCallback? onSkip;
  final VoidCallback? onKeep;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: [
          _ReviewBarButton(
            icon: Icons.close_rounded,
            label: 'delete'.t(context: context),
            color: reviewDeleteColor,
            filled: true,
            onPressed: onDelete,
          ),
          _ReviewBarButton(
            icon: Icons.undo_rounded,
            label: 'undo'.t(context: context),
            color: context.colorScheme.onSurfaceVariant,
            onPressed: onUndo,
          ),
          _ReviewBarButton(
            icon: Icons.skip_next_rounded,
            label: 'pending_review_skip'.t(context: context),
            color: context.colorScheme.onSurfaceVariant,
            onPressed: onSkip,
          ),
          _ReviewBarButton(
            icon: Icons.check_rounded,
            label: 'keep'.t(context: context),
            color: reviewKeepColor,
            filled: true,
            onPressed: onKeep,
          ),
        ],
      ),
    );
  }
}

class _ReviewBarButton extends StatelessWidget {
  const _ReviewBarButton({
    required this.icon,
    required this.label,
    required this.color,
    required this.onPressed,
    this.filled = false,
  });

  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback? onPressed;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final enabled = onPressed != null;
    final foreground = enabled ? color : context.colorScheme.onSurface.withValues(alpha: 0.3);
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        IconButton(
          onPressed: onPressed,
          iconSize: filled ? 32 : 26,
          style: IconButton.styleFrom(
            padding: EdgeInsets.all(filled ? 14 : 10),
            backgroundColor: filled && enabled ? color.withValues(alpha: 0.15) : null,
            side: BorderSide(color: foreground.withValues(alpha: 0.5)),
          ),
          icon: Icon(icon, color: foreground),
        ),
        const SizedBox(height: 4),
        Text(label, style: context.textTheme.labelMedium?.copyWith(color: foreground)),
      ],
    );
  }
}
