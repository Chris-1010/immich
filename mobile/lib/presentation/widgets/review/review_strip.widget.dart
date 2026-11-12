import 'package:flutter/material.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/presentation/widgets/review/review_preview_image.widget.dart';
import 'package:immich_mobile/presentation/widgets/review/review_swipe_card.widget.dart';
import 'package:openapi/api.dart' show AssetMediaSize;

/// Every pending asset in upload order, with a tick for Keep and a cross for Delete. The current
/// one is outlined and kept in view; tapping one calls [onTap] with its index.
class ReviewStrip extends StatefulWidget {
  const ReviewStrip({super.key, required this.items, required this.currentIndex, required this.onTap});

  final List<ReviewItem> items;
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  State<ReviewStrip> createState() => _ReviewStripState();
}

class _ReviewStripState extends State<ReviewStrip> {
  static const _size = 56.0;
  static const _gap = 6.0;
  static const _extent = _size + _gap;
  static const _padding = 12.0;

  final _controller = ScrollController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToCurrent(animate: false));
  }

  @override
  void didUpdateWidget(ReviewStrip oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.currentIndex != widget.currentIndex || oldWidget.items.length != widget.items.length) {
      WidgetsBinding.instance.addPostFrameCallback((_) => _scrollToCurrent(animate: true));
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _scrollToCurrent({required bool animate}) {
    if (!mounted || !_controller.hasClients) {
      return;
    }
    final position = _controller.position;
    final centred = _padding + widget.currentIndex * _extent + _size / 2 - position.viewportDimension / 2;
    final target = centred.clamp(position.minScrollExtent, position.maxScrollExtent);
    if (animate) {
      _controller.animateTo(target, duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
    } else {
      _controller.jumpTo(target);
    }
  }

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      height: _size + 8,
      child: ListView.builder(
        controller: _controller,
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: _padding, vertical: 4),
        itemExtent: _extent,
        itemCount: widget.items.length,
        itemBuilder: (context, index) {
          final item = widget.items[index];
          return Padding(
            padding: const EdgeInsets.only(right: _gap),
            child: _ReviewStripThumbnail(
              item: item,
              isCurrent: index == widget.currentIndex,
              onTap: () => widget.onTap(index),
            ),
          );
        },
      ),
    );
  }
}

class _ReviewStripThumbnail extends StatelessWidget {
  const _ReviewStripThumbnail({required this.item, required this.isCurrent, required this.onTap});

  final ReviewItem item;
  final bool isCurrent;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final badge = switch (item.decision) {
      PendingDecision.keep => (Icons.check_rounded, reviewKeepColor),
      PendingDecision.delete => (Icons.close_rounded, reviewDeleteColor),
      _ => null,
    };

    return GestureDetector(
      onTap: onTap,
      child: Container(
        foregroundDecoration: BoxDecoration(
          borderRadius: const BorderRadius.all(Radius.circular(8)),
          border: isCurrent ? Border.all(color: context.colorScheme.primary, width: 3) : null,
        ),
        child: ClipRRect(
          borderRadius: const BorderRadius.all(Radius.circular(8)),
          child: Stack(
            fit: StackFit.expand,
            children: [
              ColoredBox(
                color: context.colorScheme.surfaceContainerHighest,
                child: ReviewPreviewImage(assetId: item.assetId, size: AssetMediaSize.thumbnail, fit: BoxFit.cover),
              ),
              if (badge != null)
                Positioned(
                  right: 3,
                  bottom: 3,
                  child: Container(
                    padding: const EdgeInsets.all(1),
                    decoration: BoxDecoration(color: badge.$2, shape: BoxShape.circle),
                    child: Icon(badge.$1, size: 14, color: Colors.white),
                  ),
                ),
            ],
          ),
        ),
      ),
    );
  }
}
