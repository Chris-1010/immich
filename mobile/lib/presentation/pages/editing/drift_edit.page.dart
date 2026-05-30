import 'dart:async';
import 'dart:io';
import 'dart:typed_data';

import 'package:auto_route/auto_route.dart';
import 'package:easy_localization/easy_localization.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/extensions/build_context_extensions.dart';
import 'package:immich_mobile/providers/background_sync.provider.dart';
import 'package:immich_mobile/repositories/asset_api.repository.dart';
import 'package:immich_mobile/repositories/upload.repository.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/utils/image_converter.dart';
import 'package:immich_mobile/widgets/common/immich_loading_indicator.dart';
import 'package:immich_mobile/widgets/common/immich_toast.dart';
import 'package:logging/logging.dart';
import 'package:path_provider/path_provider.dart';
import 'package:path/path.dart' as p;

/// A widget that provides functionality for editing an image.
///
/// The edited [image] is rendered on-device and uploaded directly to the Immich
/// server as a new asset (keeping the original's date-taken). It is never saved
/// to the device gallery. "Save in place" additionally moves the original server
/// asset to the trash.
@immutable
@RoutePage()
class DriftEditImagePage extends ConsumerWidget {
  final BaseAsset asset;
  final Image image;
  final bool isEdited;

  const DriftEditImagePage({super.key, required this.asset, required this.image, required this.isEdited});

  void _exitEditing(BuildContext context, {bool popViewer = false}) {
    // this assumes that the only way to get to this page is from the AssetViewerRoute
    context.navigator.popUntil((route) => route.data?.name == AssetViewerRoute.name);

    // When the original asset was trashed (in-place save), the asset viewer is
    // now showing a deleted asset, so pop it too and return to the timeline.
    if (popViewer) {
      context.navigator.maybePop();
    }
  }

  /// Renders the edited [image] and uploads it straight to the server as a new
  /// asset, carrying over the original asset's date-taken. The image is never
  /// written to the device gallery — it is staged in a temporary file that is
  /// deleted after the upload.
  ///
  /// Returns the new asset's remote id on success. Throws on a render/upload
  /// failure so callers can surface an error.
  Future<String> _renderAndUploadToServer(BaseAsset asset, Image image, WidgetRef ref) async {
    final Uint8List imageData = await imageToUint8List(image);
    final fileName = "${p.withoutExtension(asset.name)}_edited.jpg";

    final tempDir = await getTemporaryDirectory();
    final tempFile = File(p.join(tempDir.path, fileName));

    try {
      await tempFile.writeAsBytes(imageData);

      final result = await ref
          .read(uploadRepositoryProvider)
          .uploadEditedImage(
            file: tempFile,
            originalFileName: fileName,
            fileCreatedAt: asset.createdAt,
            fileModifiedAt: asset.updatedAt,
          );

      if (!result.isSuccess || result.remoteAssetId == null) {
        throw Exception(result.errorMessage ?? 'Upload failed');
      }

      return result.remoteAssetId!;
    } finally {
      try {
        if (await tempFile.exists()) {
          await tempFile.delete();
        }
      } catch (e) {
        Logger("SaveEditedImage").warning("Failed to delete temporary edited image", e);
      }
    }
  }

  /// Uploads the edit to the server as a new asset, leaving the original alone.
  Future<void> _saveAsCopy(BuildContext context, BaseAsset asset, Image image, WidgetRef ref) async {
    try {
      await _runWithSpinner(context, () async {
        await _renderAndUploadToServer(asset, image, ref);
        // Pull the new asset into the local timeline so it shows without a manual sync.
        await ref.read(backgroundSyncProvider).syncRemote();
      });
      if (!context.mounted) {
        return;
      }
      _exitEditing(context);
      ImmichToast.show(durationInSecond: 3, context: context, msg: 'Image Saved!');
    } catch (e) {
      _showSaveError(context, e);
    }
  }

  /// Uploads the edit to the server as a new asset, then moves the original
  /// server asset to the Trash (recoverable). The original is only trashed after
  /// the edited copy has uploaded successfully, so a failure never loses data.
  /// If the edited asset has no server original (e.g. a purely local asset),
  /// this behaves like "save as copy".
  Future<void> _saveInPlace(BuildContext context, BaseAsset asset, Image image, WidgetRef ref) async {
    final confirmed = await _confirmReplaceOriginal(context);
    if (confirmed != true || !context.mounted) {
      return;
    }

    final originalRemoteId = asset.remoteId;
    final trashedOriginal = originalRemoteId != null;

    try {
      await _runWithSpinner(context, () async {
        await _renderAndUploadToServer(asset, image, ref);

        // Soft-trash the original server asset only after a successful upload.
        if (trashedOriginal) {
          await ref.read(assetApiRepositoryProvider).delete([originalRemoteId], false);
        }

        // Pull the new asset in and the trashed original out of the local timeline.
        await ref.read(backgroundSyncProvider).syncRemote();
      });

      if (!context.mounted) {
        return;
      }
      // If we trashed the original, also leave its (now stale) asset viewer.
      _exitEditing(context, popViewer: trashedOriginal);
      ImmichToast.show(durationInSecond: 3, context: context, msg: 'Image Saved!');
    } catch (e) {
      _showSaveError(context, e);
    }
  }

  /// Runs [action] while showing a blocking spinner overlay, ensuring the
  /// overlay is always dismissed (even on error) before returning.
  Future<void> _runWithSpinner(BuildContext context, Future<void> Function() action) async {
    final navigator = Navigator.of(context, rootNavigator: true);
    unawaited(
      showDialog(
        context: context,
        barrierDismissible: false,
        barrierColor: Colors.black54,
        useRootNavigator: true,
        builder: (_) => const PopScope(
          canPop: false,
          child: Center(child: ImmichLoadingIndicator()),
        ),
      ),
    );

    try {
      await action();
    } finally {
      // Dismiss the spinner dialog.
      if (navigator.canPop()) {
        navigator.pop();
      }
    }
  }

  Future<bool?> _confirmReplaceOriginal(BuildContext context) {
    return showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text("replace_original".tr()),
        content: Text("replace_original_confirm".tr()),
        actions: [
          TextButton(onPressed: () => Navigator.of(ctx).pop(false), child: Text("cancel".tr())),
          TextButton(onPressed: () => Navigator.of(ctx).pop(true), child: Text("confirm".tr())),
        ],
      ),
    );
  }

  void _showSaveError(BuildContext context, Object e) {
    if (!context.mounted) {
      return;
    }
    ImmichToast.show(
      durationInSecond: 6,
      context: context,
      msg: "error_saving_image".tr(namedArgs: {'error': e.toString()}),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: Text("edit".tr()),
        backgroundColor: context.scaffoldBackgroundColor,
        leading: IconButton(
          icon: Icon(Icons.close_rounded, color: context.primaryColor, size: 24),
          onPressed: () => _exitEditing(context),
        ),
        actions: <Widget>[
          PopupMenuButton<_SaveAction>(
            enabled: isEdited,
            position: PopupMenuPosition.under,
            onSelected: (action) {
              switch (action) {
                case _SaveAction.copy:
                  _saveAsCopy(context, asset, image, ref);
                case _SaveAction.inPlace:
                  _saveInPlace(context, asset, image, ref);
              }
            },
            itemBuilder: (context) => [
              PopupMenuItem(value: _SaveAction.copy, child: Text("save_as_copy".tr())),
              PopupMenuItem(value: _SaveAction.inPlace, child: Text("replace_original".tr())),
            ],
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
              child: Text("save".tr(), style: TextStyle(color: isEdited ? context.primaryColor : Colors.grey)),
            ),
          ),
        ],
      ),
      backgroundColor: context.scaffoldBackgroundColor,
      body: Center(
        child: ConstrainedBox(
          constraints: BoxConstraints(maxHeight: context.height * 0.7, maxWidth: context.width * 0.9),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: const BorderRadius.all(Radius.circular(7)),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: 0.2),
                  spreadRadius: 2,
                  blurRadius: 10,
                  offset: const Offset(0, 3),
                ),
              ],
            ),
            child: ClipRRect(
              borderRadius: const BorderRadius.all(Radius.circular(7)),
              child: Image(image: image.image, fit: BoxFit.contain),
            ),
          ),
        ),
      ),
      bottomNavigationBar: Container(
        height: 70,
        margin: const EdgeInsets.only(bottom: 60, right: 10, left: 10, top: 10),
        decoration: BoxDecoration(
          color: context.scaffoldBackgroundColor,
          borderRadius: const BorderRadius.all(Radius.circular(30)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
          children: <Widget>[
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                IconButton(
                  icon: Icon(Icons.crop_rotate_rounded, color: context.themeData.iconTheme.color, size: 25),
                  onPressed: () {
                    context.pushRoute(DriftCropImageRoute(asset: asset, image: image));
                  },
                ),
                Text("crop".tr(), style: context.textTheme.displayMedium),
              ],
            ),
            Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: <Widget>[
                IconButton(
                  icon: Icon(Icons.filter, color: context.themeData.iconTheme.color, size: 25),
                  onPressed: () {
                    context.pushRoute(DriftFilterImageRoute(asset: asset, image: image));
                  },
                ),
                Text("filter".tr(), style: context.textTheme.displayMedium),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

enum _SaveAction { copy, inPlace }
