import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/review/review_preview_image.widget.dart';

const reviewKeepColor = Color(0xFF2E7D32);
const reviewDeleteColor = Color(0xFFC62828);

/// The image being reviewed. Drag right to keep it and left to delete it: the card follows the
/// finger, tilts and tints green or red, and commits past [commitFraction] of its width or on a
/// fling. A quick upward fling calls [onSwipeUp] instead (e.g. to open a details sheet).
///
/// [overlays] are stacked over the image, under the decision tint, for badges and pills.
/// Give each asset its own key so a new card starts centred.
class ReviewSwipeCard extends StatefulWidget {
  const ReviewSwipeCard({
    super.key,
    required this.assetId,
    required this.onDecide,
    this.onSwipeUp,
    this.onTap,
    this.swipeEnabled = true,
    this.overlays = const [],
    this.commitFraction = 0.35,
  });

  final String assetId;
  final ValueChanged<PendingDecision> onDecide;
  final VoidCallback? onSwipeUp;
  final VoidCallback? onTap;

  /// When false, horizontal drags neither move the card nor decide (e.g. while a sheet is open).
  final bool swipeEnabled;
  final List<Widget> overlays;
  final double commitFraction;

  @override
  State<ReviewSwipeCard> createState() => _ReviewSwipeCardState();
}

class _ReviewSwipeCardState extends State<ReviewSwipeCard> with SingleTickerProviderStateMixin {
  static const _flingVelocity = 1000.0;
  static const _maxTilt = 0.25;

  late final AnimationController _controller = AnimationController(
    vsync: this,
    duration: const Duration(milliseconds: 220),
  )..addListener(_onAnimate);

  Animation<double>? _animation;
  double _dx = 0;
  double _width = 1;
  bool _committing = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onAnimate() {
    final animation = _animation;
    if (animation != null) {
      setState(() => _dx = animation.value);
    }
  }

  Future<void> _animateTo(double target) async {
    _animation = Tween<double>(
      begin: _dx,
      end: target,
    ).animate(CurvedAnimation(parent: _controller, curve: Curves.easeOut));
    await _controller.forward(from: 0);
  }

  void _onDragUpdate(DragUpdateDetails details) {
    if (!widget.swipeEnabled || _committing) {
      return;
    }
    _controller.stop();
    setState(() => _dx += details.delta.dx);
  }

  Future<void> _onDragEnd(DragEndDetails details) async {
    if (!widget.swipeEnabled || _committing) {
      return;
    }
    final velocity = details.velocity.pixelsPerSecond;

    if (velocity.dy < -_flingVelocity && velocity.dy.abs() > velocity.dx.abs() * 2 && widget.onSwipeUp != null) {
      await _animateTo(0);
      widget.onSwipeUp!();
      return;
    }

    final passed = _dx.abs() > _width * widget.commitFraction;
    final flung = velocity.dx.abs() > _flingVelocity && (velocity.dx.sign == _dx.sign || _dx == 0);
    if (!passed && !flung) {
      await _animateTo(0);
      return;
    }

    final direction = passed ? _dx.sign : velocity.dx.sign;
    _committing = true;
    await _animateTo(direction * _width * 1.5);
    if (!mounted) {
      return;
    }
    widget.onDecide(direction > 0 ? PendingDecision.keep : PendingDecision.delete);
    // Usually the card is replaced by the next one; if it stays (e.g. the decision was ignored),
    // bring it back to the centre.
    if (mounted) {
      setState(() {
        _dx = 0;
        _committing = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) {
        _width = math.max(constraints.maxWidth, 1);
        final progress = (_dx / (_width * widget.commitFraction)).clamp(-1.0, 1.0);
        final tint = progress >= 0 ? reviewKeepColor : reviewDeleteColor;

        return GestureDetector(
          behavior: HitTestBehavior.opaque,
          onTap: widget.onTap,
          onPanUpdate: _onDragUpdate,
          onPanEnd: _onDragEnd,
          child: Transform.translate(
            offset: Offset(_dx, 0),
            child: Transform.rotate(
              angle: _maxTilt * (_dx / _width),
              child: ClipRRect(
                borderRadius: const BorderRadius.all(Radius.circular(16)),
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    ReviewPreviewImage(assetId: widget.assetId),
                    ...widget.overlays,
                    if (progress != 0)
                      IgnorePointer(
                        child: ColoredBox(
                          color: tint.withValues(alpha: 0.35 * progress.abs()),
                          child: Center(
                            child: Opacity(
                              opacity: progress.abs(),
                              child: _DecisionStamp(
                                decision: progress > 0 ? PendingDecision.keep : PendingDecision.delete,
                              ),
                            ),
                          ),
                        ),
                      ),
                  ],
                ),
              ),
            ),
          ),
        );
      },
    );
  }
}

class _DecisionStamp extends StatelessWidget {
  const _DecisionStamp({required this.decision});

  final PendingDecision decision;

  @override
  Widget build(BuildContext context) {
    final isKeep = decision == PendingDecision.keep;
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(isKeep ? Icons.check_circle_rounded : Icons.cancel_rounded, size: 72, color: Colors.white),
        Text(
          (isKeep ? 'keep' : 'delete').t(context: context),
          style: const TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.w700),
        ),
      ],
    );
  }
}
