import 'dart:async';
import 'dart:ui';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:image/image.dart' as img;

/// Converts a Flutter [Image] widget to a [Uint8List] in JPEG format.
///
/// This function resolves the image stream, reads the raw RGBA pixels and
/// re-encodes them as JPEG so the saved file matches its `.jpg` extension.
/// The JPEG encoding (CPU-heavy for full-resolution images) runs on a background
/// isolate via [compute] to avoid janking the UI thread.
/// Returns a [Future] that completes with the image bytes or completes with an error
/// if the conversion fails.
Future<Uint8List> imageToUint8List(Image image, {int quality = 85}) async {
  final Completer<Uint8List> completer = Completer();
  image.image
      .resolve(const ImageConfiguration())
      .addListener(
        ImageStreamListener((ImageInfo info, bool _) async {
          try {
            final byteData = await info.image.toByteData(format: ImageByteFormat.rawRgba);
            if (byteData == null) {
              completer.completeError('Failed to convert image to bytes');
              return;
            }

            final jpg = await compute(
              _encodeJpg,
              _RawImage(
                bytes: byteData.buffer.asUint8List(),
                width: info.image.width,
                height: info.image.height,
                quality: quality,
              ),
            );
            completer.complete(jpg);
          } catch (e) {
            completer.completeError(e);
          }
        }, onError: (exception, stackTrace) => completer.completeError(exception)),
      );
  return completer.future;
}

class _RawImage {
  final Uint8List bytes;
  final int width;
  final int height;
  final int quality;

  const _RawImage({required this.bytes, required this.width, required this.height, required this.quality});
}

Uint8List _encodeJpg(_RawImage raw) {
  final image = img.Image.fromBytes(width: raw.width, height: raw.height, bytes: raw.bytes.buffer, numChannels: 4);
  return img.encodeJpg(image, quality: raw.quality);
}
