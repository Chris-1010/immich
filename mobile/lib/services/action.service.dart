import 'dart:async';

import 'package:auto_route/auto_route.dart';
import 'package:flutter/material.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/constants/enums.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/extensions/platform_extensions.dart';
import 'package:immich_mobile/infrastructure/repositories/local_asset.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/remote_album.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/remote_asset.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/trashed_local_asset.repository.dart';
import 'package:immich_mobile/providers/infrastructure/album.provider.dart';
import 'package:immich_mobile/providers/infrastructure/asset.provider.dart';
import 'package:immich_mobile/repositories/asset_api.repository.dart';
import 'package:immich_mobile/repositories/asset_media.repository.dart';
import 'package:immich_mobile/repositories/download.repository.dart';
import 'package:immich_mobile/repositories/drift_album_api_repository.dart';
import 'package:immich_mobile/repositories/saved_location_api.repository.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/utils/timezone.dart';
import 'package:immich_mobile/widgets/common/date_time_picker.dart';
import 'package:immich_mobile/widgets/common/location_picker.dart';
import 'package:logging/logging.dart';
import 'package:maplibre_gl/maplibre_gl.dart' as maplibre;
import 'package:riverpod_annotation/riverpod_annotation.dart';

final actionServiceProvider = Provider<ActionService>(
  (ref) => ActionService(
    ref.watch(assetApiRepositoryProvider),
    ref.watch(remoteAssetRepositoryProvider),
    ref.watch(localAssetRepository),
    ref.watch(driftAlbumApiRepositoryProvider),
    ref.watch(remoteAlbumRepository),
    ref.watch(trashedLocalAssetRepository),
    ref.watch(assetMediaRepositoryProvider),
    ref.watch(downloadRepositoryProvider),
    ref.watch(savedLocationApiRepositoryProvider),
  ),
);

class ActionService {
  final AssetApiRepository _assetApiRepository;
  final RemoteAssetRepository _remoteAssetRepository;
  final DriftLocalAssetRepository _localAssetRepository;
  final DriftAlbumApiRepository _albumApiRepository;
  final DriftRemoteAlbumRepository _remoteAlbumRepository;
  final DriftTrashedLocalAssetRepository _trashedLocalAssetRepository;
  final AssetMediaRepository _assetMediaRepository;
  final DownloadRepository _downloadRepository;
  final SavedLocationApiRepository _savedLocationApiRepository;

  const ActionService(
    this._assetApiRepository,
    this._remoteAssetRepository,
    this._localAssetRepository,
    this._albumApiRepository,
    this._remoteAlbumRepository,
    this._trashedLocalAssetRepository,
    this._assetMediaRepository,
    this._downloadRepository,
    this._savedLocationApiRepository,
  );

  Future<void> shareLink(List<String> remoteIds, BuildContext context) async {
    unawaited(context.pushRoute(SharedLinkEditRoute(assetsList: remoteIds)));
  }

  Future<void> favorite(List<String> remoteIds) async {
    await _assetApiRepository.updateFavorite(remoteIds, true);
    await _remoteAssetRepository.updateFavorite(remoteIds, true);
  }

  Future<void> unFavorite(List<String> remoteIds) async {
    await _assetApiRepository.updateFavorite(remoteIds, false);
    await _remoteAssetRepository.updateFavorite(remoteIds, false);
  }

  Future<void> archive(List<String> remoteIds) async {
    await _assetApiRepository.updateVisibility(remoteIds, AssetVisibilityEnum.archive);
    await _remoteAssetRepository.updateVisibility(remoteIds, AssetVisibility.archive);
  }

  Future<void> unArchive(List<String> remoteIds) async {
    await _assetApiRepository.updateVisibility(remoteIds, AssetVisibilityEnum.timeline);
    await _remoteAssetRepository.updateVisibility(remoteIds, AssetVisibility.timeline);
  }

  Future<void> moveToLockFolder(List<String> remoteIds, List<String> localIds) async {
    await _assetApiRepository.updateVisibility(remoteIds, AssetVisibilityEnum.locked);
    await _remoteAssetRepository.updateVisibility(remoteIds, AssetVisibility.locked);

    // Ask user if they want to delete local copies
    if (localIds.isNotEmpty) {
      await _deleteLocalAssets(localIds);
    }
  }

  Future<void> removeFromLockFolder(List<String> remoteIds) async {
    await _assetApiRepository.updateVisibility(remoteIds, AssetVisibilityEnum.timeline);
    await _remoteAssetRepository.updateVisibility(remoteIds, AssetVisibility.timeline);
  }

  Future<void> trash(List<String> remoteIds) async {
    await _assetApiRepository.delete(remoteIds, false);
    await _remoteAssetRepository.trash(remoteIds);
  }

  Future<void> restoreTrash(List<String> ids) async {
    await _assetApiRepository.restoreTrash(ids);
    await _remoteAssetRepository.restoreTrash(ids);
  }

  Future<void> trashRemoteAndDeleteLocal(List<String> remoteIds, List<String> localIds) async {
    await _assetApiRepository.delete(remoteIds, false);
    await _remoteAssetRepository.trash(remoteIds);

    if (localIds.isNotEmpty) {
      await _deleteLocalAssets(localIds);
    }
  }

  Future<void> deleteRemoteAndLocal(List<String> remoteIds, List<String> localIds) async {
    await _assetApiRepository.delete(remoteIds, true);
    await _remoteAssetRepository.delete(remoteIds);

    if (localIds.isNotEmpty) {
      await _deleteLocalAssets(localIds);
    }
  }

  Future<int> deleteLocal(List<String> localIds) async {
    return await _deleteLocalAssets(localIds);
  }

  Future<bool> editLocation(List<String> remoteIds, BuildContext context) async {
    maplibre.LatLng? initialLatLng;
    var noLocationMode = NoLocationMode.mark;
    if (remoteIds.length == 1) {
      final exif = await _remoteAssetRepository.getExif(remoteIds[0]);

      if (exif?.latitude != null && exif?.longitude != null) {
        initialLatLng = maplibre.LatLng(exif!.latitude!, exif.longitude!);
      } else {
        // Only an asset without coordinates can be marked No Location, so the flag is only worth
        // asking the server about then. Failing to ask still leaves "No Location" on offer.
        try {
          if (await _savedLocationApiRepository.getNoLocation(remoteIds[0])) {
            noLocationMode = NoLocationMode.unassign;
          }
        } catch (error, stack) {
          Logger('ActionService').warning('Failed to read No Location flag', error, stack);
        }
      }
    }

    if (!context.mounted) {
      return false;
    }

    final result = await pickLocation(context: context, initialLatLng: initialLatLng, noLocationMode: noLocationMode);

    if (result == null) {
      return false;
    }

    await applyLocation(remoteIds, result);
    return true;
  }

  /// Applies what the location picker returned to the assets, on the server and locally.
  Future<void> applyLocation(List<String> remoteIds, LocationPickerResult result) async {
    switch (result) {
      case PickedPoint(:final latLng):
        await _assetApiRepository.updateLocation(remoteIds, latLng);
        await _remoteAssetRepository.updateLocation(remoteIds, latLng);
      case PickedNoLocation(value: true):
        await _savedLocationApiRepository.markNoLocation(remoteIds);
        await _remoteAssetRepository.clearLocation(remoteIds);
      case PickedNoLocation(value: false):
        // Unassigning leaves the asset without coordinates, so there is nothing to change locally.
        for (final id in remoteIds) {
          await _savedLocationApiRepository.unassignNoLocation(id);
        }
    }
  }

  Future<bool> editDateTime(List<String> remoteIds, BuildContext context) async {
    DateTime? initialDate;
    String? timeZone;
    Duration? offset;

    if (remoteIds.length == 1) {
      final assetId = remoteIds.first;
      final asset = await _remoteAssetRepository.get(assetId);
      if (asset == null) {
        return false;
      }

      final exifData = await _remoteAssetRepository.getExif(assetId);

      // Use EXIF timezone information if available (matching web app and display behavior)
      DateTime dt = asset.createdAt.toLocal();
      offset = dt.timeZoneOffset;

      if (exifData?.dateTimeOriginal != null) {
        timeZone = exifData!.timeZone;
        (dt, offset) = applyTimezoneOffset(dateTime: exifData.dateTimeOriginal!, timeZone: exifData.timeZone);
      }

      initialDate = dt;
    }

    final dateTime = await showDateTimePicker(
      context: context,
      initialDateTime: initialDate,
      initialTZ: timeZone,
      initialTZOffset: offset,
    );

    if (dateTime == null) {
      return false;
    }

    // convert dateTime to DateTime object
    final parsedDateTime = DateTime.parse(dateTime);

    await _assetApiRepository.updateDateTime(remoteIds, parsedDateTime);
    await _remoteAssetRepository.updateDateTime(remoteIds, parsedDateTime);

    return true;
  }

  Future<int> removeFromAlbum(List<String> remoteIds, String albumId) async {
    final result = await _albumApiRepository.removeAssets(albumId, remoteIds);
    if (result.removed.isNotEmpty) {
      await _remoteAlbumRepository.removeAssets(albumId, result.removed);
    }
    return result.removed.length;
  }

  Future<bool> updateDescription(String assetId, String description) async {
    // update remote first, then local to ensure consistency
    await _assetApiRepository.updateDescription(assetId, description);
    await _remoteAssetRepository.updateDescription(assetId, description);

    return true;
  }

  Future<bool> updateRating(String assetId, int rating) async {
    // update remote first, then local to ensure consistency
    await _assetApiRepository.updateRating(assetId, rating);
    await _remoteAssetRepository.updateRating(assetId, rating);

    return true;
  }

  Future<void> stack(String userId, List<String> remoteIds) async {
    final stack = await _assetApiRepository.stack(remoteIds);
    await _remoteAssetRepository.stack(userId, stack);
  }

  Future<void> unStack(List<String> stackIds) async {
    await _remoteAssetRepository.unStack(stackIds);
    await _assetApiRepository.unStack(stackIds);
  }

  Future<int> shareAssets(List<BaseAsset> assets, BuildContext context, {Completer<void>? cancelCompleter}) {
    return _assetMediaRepository.shareAssets(assets, context, cancelCompleter: cancelCompleter);
  }

  Future<List<bool>> downloadAll(List<RemoteAsset> assets) {
    return _downloadRepository.downloadAllAssets(assets);
  }

  Future<bool> setAlbumCover(String albumId, String assetId) async {
    final updatedAlbum = await _albumApiRepository.updateAlbum(albumId, thumbnailAssetId: assetId);
    await _remoteAlbumRepository.update(updatedAlbum);
    return true;
  }

  Future<int> _deleteLocalAssets(List<String> localIds) async {
    final deletedIds = await _assetMediaRepository.deleteAll(localIds);
    if (deletedIds.isEmpty) {
      return 0;
    }
    if (CurrentPlatform.isAndroid && Store.get(StoreKey.manageLocalMediaAndroid, false)) {
      await _trashedLocalAssetRepository.applyTrashedAssets(deletedIds);
    } else {
      await _localAssetRepository.delete(deletedIds);
    }
    return deletedIds.length;
  }
}
