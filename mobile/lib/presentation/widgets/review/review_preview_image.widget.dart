import 'dart:async';

import 'package:flutter/material.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/extensions/translate_extensions.dart';
import 'package:immich_mobile/presentation/widgets/images/remote_image_provider.dart';
import 'package:immich_mobile/utils/image_url_builder.dart';
import 'package:openapi/api.dart' show AssetMediaSize;

/// A server image of a pending asset. A fresh upload has no thumbnail for a few seconds, so a
/// failed load shows a spinner and is retried a few times before offering a manual retry.
class ReviewPreviewImage extends StatefulWidget {
  const ReviewPreviewImage({
    super.key,
    required this.assetId,
    this.size = AssetMediaSize.preview,
    this.fit = BoxFit.contain,
  });

  final String assetId;
  final AssetMediaSize size;
  final BoxFit fit;

  @override
  State<ReviewPreviewImage> createState() => _ReviewPreviewImageState();
}

class _ReviewPreviewImageState extends State<ReviewPreviewImage> {
  static const _maxAutoRetries = 5;
  static const _retryDelay = Duration(seconds: 3);

  int _attempt = 0;
  bool _failed = false;
  Timer? _retryTimer;

  @override
  void didUpdateWidget(ReviewPreviewImage oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.assetId != widget.assetId || oldWidget.size != widget.size) {
      _retryTimer?.cancel();
      _retryTimer = null;
      _attempt = 0;
      _failed = false;
    }
  }

  @override
  void dispose() {
    _retryTimer?.cancel();
    super.dispose();
  }

  String get _url {
    final url = getThumbnailUrlForRemoteId(widget.assetId, type: widget.size);
    // A new URL per attempt keeps the image cache from handing back the failed load.
    return _attempt == 0 ? url : '$url&retry=$_attempt';
  }

  void _retry() {
    _retryTimer?.cancel();
    _retryTimer = null;
    if (!mounted) {
      return;
    }
    setState(() {
      _attempt++;
      _failed = false;
    });
  }

  void _onError() {
    if (_retryTimer != null || _failed) {
      return;
    }
    if (_attempt >= _maxAutoRetries) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted) {
          setState(() => _failed = true);
        }
      });
      return;
    }
    _retryTimer = Timer(_retryDelay, _retry);
  }

  @override
  Widget build(BuildContext context) {
    final spinner = const Center(child: CircularProgressIndicator());
    return Image(
      key: ValueKey(_url),
      image: RemoteImageProvider(url: _url),
      fit: widget.fit,
      gaplessPlayback: true,
      frameBuilder: (context, child, frame, wasSynchronouslyLoaded) {
        if (frame == null && !wasSynchronouslyLoaded) {
          return spinner;
        }
        return child;
      },
      errorBuilder: (context, error, stackTrace) {
        _onError();
        if (!_failed) {
          return spinner;
        }
        return Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.image_not_supported_outlined, size: 40, color: context.colorScheme.onSurfaceVariant),
              TextButton(
                onPressed: _retry,
                child: Text('refresh'.t(context: context)),
              ),
            ],
          ),
        );
      },
    );
  }
}
