import 'dart:async';
import 'dart:io';

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/models/upload/share_intent_attachment.model.dart';
import 'package:immich_mobile/providers/routes.provider.dart';
import 'package:immich_mobile/repositories/asset_api.repository.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/services/share_intent_service.dart';
import 'package:immich_mobile/services/foreground_upload.service.dart';
import 'package:immich_mobile/utils/timezone.dart';
import 'package:logging/logging.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:openapi/api.dart';
import 'package:path/path.dart' as p;
import 'package:wakelock_plus/wakelock_plus.dart';

final shareIntentUploadProvider = StateNotifierProvider<ShareIntentUploadStateNotifier, List<ShareIntentAttachment>>((
  ref,
) {
  final notifier = ShareIntentUploadStateNotifier(
    ref.watch(appRouterProvider),
    ref.read(foregroundUploadServiceProvider),
    ref.read(shareIntentServiceProvider),
    ref.read(assetApiRepositoryProvider),
  );
  ref.listen(currentRouteNameProvider, (_, routeName) => notifier.onRouteChanged(routeName));
  return notifier;
});

/// Routes shown while the app is still starting up or signing in. A share that
/// arrives during them is held until the app reaches its main screen, otherwise
/// the startup navigation replaces the upload page.
const _startupRoutes = {SplashScreenRoute.name, LoginRoute.name, ChangeExperienceRoute.name};

/// Delays between metadata polls after an upload or edit; about 15 s in total.
const _pollDelays = [
  Duration(seconds: 1),
  Duration(seconds: 1),
  Duration(seconds: 2),
  Duration(seconds: 2),
  Duration(seconds: 3),
  Duration(seconds: 3),
  Duration(seconds: 3),
];

class ShareIntentUploadStateNotifier extends StateNotifier<List<ShareIntentAttachment>> {
  final AppRouter router;
  final ForegroundUploadService _foregroundUploadService;
  final ShareIntentService _shareIntentService;
  final AssetApiRepository _assetApiRepository;
  final Logger _logger = Logger('ShareIntentUploadStateNotifier');

  List<ShareIntentAttachment>? _pendingShare;
  String? _currentRouteName;
  int _activeUploads = 0;

  ShareIntentUploadStateNotifier(
    this.router,
    this._foregroundUploadService,
    this._shareIntentService,
    this._assetApiRepository,
  ) : super([]);

  void init() {
    _shareIntentService.onSharedMedia = onSharedMedia;
    _shareIntentService.init();
  }

  bool get _isAppReady => _currentRouteName != null && !_startupRoutes.contains(_currentRouteName);

  void onSharedMedia(List<ShareIntentAttachment> attachments) {
    if (!_isAppReady) {
      _logger.info("Holding shared media until startup finishes (route: $_currentRouteName)");
      _pendingShare = attachments;
      return;
    }
    _showShare(attachments);
  }

  void onRouteChanged(String? routeName) {
    _currentRouteName = routeName;
    final pending = _pendingShare;
    if (pending != null && _isAppReady) {
      _pendingShare = null;
      _showShare(pending);
    }
  }

  void _showShare(List<ShareIntentAttachment> attachments) {
    router.removeWhere((route) => route.name == ShareIntentRoute.name);
    clearAttachments();
    addAttachments(attachments);
    router.push(ShareIntentRoute(attachments: attachments));
  }

  void addAttachments(List<ShareIntentAttachment> attachments) {
    if (attachments.isEmpty) {
      return;
    }
    state = [...state, ...attachments];
  }

  void removeAttachment(ShareIntentAttachment attachment) {
    final updatedState = state.where((element) => element != attachment).toList();
    if (updatedState.length != state.length) {
      state = updatedState;
    }
  }

  void clearAttachments() {
    if (state.isEmpty) {
      return;
    }

    state = [];
  }

  Future<void> uploadAll(List<File> files) async {
    for (final file in files) {
      final fileId = p.hash(file.path).toString();
      _updateStatus(fileId, UploadStatus.running, progress: 0.0);
    }

    _activeUploads++;
    await WakelockPlus.enable();
    try {
      await _foregroundUploadService.uploadShareIntent(
        files,
        onProgress: (fileId, bytes, totalBytes) {
          final progress = totalBytes > 0 ? bytes / totalBytes : 0.0;
          _updateProgress(fileId, progress);
        },
        onSuccess: (fileId, remoteAssetId) {
          _updateStatus(fileId, UploadStatus.complete, progress: 1.0, remoteAssetId: remoteAssetId);
          unawaited(_loadDetails(int.parse(fileId), remoteAssetId));
        },
        onError: (fileId, errorMessage) {
          _logger.warning("Upload failed for file: $fileId, error: $errorMessage");
          _updateStatus(fileId, UploadStatus.failed);
        },
      );
    } finally {
      _activeUploads--;
      if (_activeUploads == 0) {
        await WakelockPlus.disable();
      }
    }
  }

  /// Uploads a failed attachment again, from the start.
  Future<void> retry(ShareIntentAttachment attachment) => uploadAll([attachment.file]);

  ShareIntentAttachment? _find(int id) {
    for (final attachment in state) {
      if (attachment.id == id) {
        return attachment;
      }
    }
    return null;
  }

  void _updateDetails(int id, ShareIntentAssetDetails Function(ShareIntentAssetDetails details) update) {
    state = [
      for (final attachment in state)
        if (attachment.id == id && attachment.details != null)
          attachment.copyWith(details: update(attachment.details!))
        else
          attachment,
    ];
  }

  /// Polls the server until it has extracted the uploaded asset's metadata,
  /// which happens in a background job shortly after the upload.
  Future<void> _loadDetails(int id, String remoteAssetId) async {
    state = [
      for (final attachment in state)
        if (attachment.id == id) attachment.copyWith(details: const ShareIntentAssetDetails.loading()) else attachment,
    ];

    AssetResponseDto? asset;
    for (final delay in _pollDelays) {
      await Future.delayed(delay);
      if (!mounted || _find(id)?.remoteAssetId != remoteAssetId) {
        return;
      }
      try {
        asset = await _assetApiRepository.getAssetInfo(remoteAssetId);
      } catch (error) {
        _logger.warning("Failed to fetch details for $remoteAssetId: $error");
        continue;
      }
      if (asset.exifInfo?.dateTimeOriginal != null) {
        break;
      }
    }

    if (!mounted) {
      return;
    }

    final exif = asset?.exifInfo;
    final (dateTime, offset) = _wallClockTime(
      exif?.dateTimeOriginal ?? asset?.fileCreatedAt ?? DateTime.now(),
      exif?.timeZone,
    );
    _updateDetails(
      id,
      (details) => details.isDateEdited || details.isLocationEdited
          // The user edited while the poll was running; keep their values.
          ? details.copyWith(isLoading: false)
          : ShareIntentAssetDetails(
              dateTime: dateTime,
              timeZone: exif?.timeZone,
              timeZoneOffset: offset,
              latitude: exif?.latitude?.toDouble(),
              longitude: exif?.longitude?.toDouble(),
              city: exif?.city,
              state: exif?.state,
              country: exif?.country,
            ),
    );
  }

  (DateTime, Duration) _wallClockTime(DateTime dateTime, String? timeZone) {
    if (timeZone == null) {
      final local = dateTime.toLocal();
      return (local, local.timeZoneOffset);
    }
    return applyTimezoneOffset(dateTime: dateTime, timeZone: timeZone);
  }

  /// Saves a date picked with `showDateTimePicker`, which returns
  /// `yyyy-MM-ddTHH:mm:ss±hh:mm`.
  Future<void> updateDateTime(ShareIntentAttachment attachment, String pickedDateTime) async {
    final remoteAssetId = attachment.remoteAssetId;
    if (remoteAssetId == null) {
      return;
    }

    final instant = DateTime.parse(pickedDateTime);
    await _assetApiRepository.updateDateTime([remoteAssetId], instant);

    final wallClock = DateTime.parse("${pickedDateTime.substring(0, 19)}Z");
    _updateDetails(
      attachment.id,
      (details) => details.copyWith(
        dateTime: wallClock,
        timeZoneOffset: wallClock.difference(instant),
        isDateEdited: true,
        isLoading: false,
      ),
    );
  }

  /// Saves [location] on the given attachments, then polls until the server
  /// has reverse-geocoded it into a place name.
  Future<void> updateLocation(List<ShareIntentAttachment> attachments, LatLng location) async {
    final targets = attachments.where((attachment) => attachment.remoteAssetId != null).toList();
    if (targets.isEmpty) {
      return;
    }

    await _assetApiRepository.updateLocation(targets.map((target) => target.remoteAssetId!).toList(), location);

    for (final target in targets) {
      _updateDetails(
        target.id,
        (details) => ShareIntentAssetDetails(
          dateTime: details.dateTime,
          timeZone: details.timeZone,
          timeZoneOffset: details.timeZoneOffset,
          latitude: location.latitude,
          longitude: location.longitude,
          isGeocoding: true,
          isDateEdited: details.isDateEdited,
          isLocationEdited: true,
        ),
      );
      unawaited(_awaitPlaceName(target.id, target.remoteAssetId!, location));
    }
  }

  Future<void> _awaitPlaceName(int id, String remoteAssetId, LatLng location) async {
    bool isCurrent() {
      final details = _find(id)?.details;
      return mounted && details?.latitude == location.latitude && details?.longitude == location.longitude;
    }

    for (final delay in _pollDelays) {
      await Future.delayed(delay);
      if (!isCurrent()) {
        return;
      }
      final ExifResponseDto? exif;
      try {
        exif = (await _assetApiRepository.getAssetInfo(remoteAssetId)).exifInfo;
      } catch (error) {
        _logger.warning("Failed to fetch place name for $remoteAssetId: $error");
        continue;
      }
      // Stale exif (from before the update) still carries the old coordinates.
      final matches =
          exif?.latitude != null &&
          (exif!.latitude! - location.latitude).abs() < 1e-4 &&
          (exif.longitude! - location.longitude).abs() < 1e-4;
      if (matches && (exif.city != null || exif.state != null || exif.country != null)) {
        if (isCurrent()) {
          _updateDetails(
            id,
            (details) =>
                details.copyWith(city: exif!.city, state: exif.state, country: exif.country, isGeocoding: false),
          );
        }
        return;
      }
    }

    // No place name (e.g. open sea, or geocoding disabled): keep coordinates.
    if (isCurrent()) {
      _updateDetails(id, (details) => details.copyWith(isGeocoding: false));
    }
  }

  void _updateStatus(String fileId, UploadStatus status, {double? progress, String? remoteAssetId}) {
    final id = int.parse(fileId);
    state = [
      for (final attachment in state)
        if (attachment.id == id)
          attachment.copyWith(
            status: status,
            uploadProgress: progress ?? attachment.uploadProgress,
            remoteAssetId: remoteAssetId,
          )
        else
          attachment,
    ];
  }

  void _updateProgress(String fileId, double progress) {
    final id = int.parse(fileId);
    state = [
      for (final attachment in state)
        if (attachment.id == id) attachment.copyWith(uploadProgress: progress) else attachment,
    ];
  }
}
