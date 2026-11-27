import 'dart:async';

import 'package:cast/session.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/models/cast/cast_manager_state.dart';
import 'package:immich_mobile/models/sessions/session_create_response.model.dart';
import 'package:immich_mobile/repositories/asset_api.repository.dart';
import 'package:immich_mobile/repositories/gcast.repository.dart';
import 'package:immich_mobile/repositories/sessions_api.repository.dart';
import 'package:immich_mobile/utils/image_url_builder.dart';
// ignore: import_rule_openapi, we are only using the AssetMediaSize enum
import 'package:openapi/api.dart';

final gCastServiceProvider = Provider(
  (ref) => GCastService(
    ref.watch(gCastRepositoryProvider),
    ref.watch(sessionsAPIRepositoryProvider),
    ref.watch(assetApiRepositoryProvider),
  ),
);

class GCastService {
  final GCastRepository _gCastRepository;
  final SessionsAPIRepository _sessionsApiService;
  final AssetApiRepository _assetApiRepository;

  SessionCreateResponse? sessionKey;
  String? currentAssetId;
  bool isConnected = false;
  int? _sessionId;
  Timer? _mediaStatusPollingTimer;

  // The asset of the last LOAD sent, and whether that LOAD pointed the receiver
  // at the LAN endpoint. Used to fall back to the server endpoint when the
  // receiver cannot reach the LAN address.
  RemoteAsset? _loadingAsset;
  bool _loadedViaLocal = false;

  void Function(bool)? onConnectionState;

  void Function(Duration)? onCurrentTime;

  void Function(Duration)? onDuration;

  void Function(String)? onReceiverName;

  void Function(CastState)? onCastState;

  void Function(String)? onReceiverError;

  GCastService(this._gCastRepository, this._sessionsApiService, this._assetApiRepository) {
    _gCastRepository.onCastStatus = _onCastStatusCallback;
    _gCastRepository.onCastMessage = _onCastMessageCallback;
  }

  void _onCastStatusCallback(CastSessionState state) {
    if (state == CastSessionState.connected) {
      onConnectionState?.call(true);
      isConnected = true;
    } else if (state == CastSessionState.closed) {
      onConnectionState?.call(false);
      isConnected = false;
      onReceiverName?.call("");
      currentAssetId = null;
    }
  }

  void _onCastMessageCallback(Map<String, dynamic> message) {
    switch (message['type']) {
      case "MEDIA_STATUS":
        _handleMediaStatus(message);
        break;
      case "LOAD_FAILED":
      case "ERROR":
      case "INVALID_REQUEST":
        _handleLoadError(message);
        break;
    }
  }

  void _handleLoadError(Map<String, dynamic> message) {
    // The receiver rejected the media it was told to load. This usually means
    // the receiver could not fetch the media URL (unreachable host, untrusted
    // TLS certificate) or the codec/container is unsupported. Surface it so the
    // failure is visible instead of the app appearing to cast into the void.
    _mediaStatusPollingTimer?.cancel();
    currentAssetId = null;

    final asset = _loadingAsset;
    if (_loadedViaLocal && asset != null) {
      // The receiver could not load from the LAN endpoint (e.g. a TV on another
      // network). Retry once with the endpoint the app itself is using.
      unawaited(_loadMedia(asset, true, preferLocal: false));
      return;
    }

    final reason = message['reason'] ?? message['detailedErrorCode'] ?? message['type'];
    onReceiverError?.call(reason.toString());
  }

  void _handleMediaStatus(Map<String, dynamic> message) {
    final statusList = (message['status'] as List).whereType<Map<String, dynamic>>().toList();

    if (statusList.isEmpty) {
      return;
    }

    final status = statusList[0];
    switch (status['playerState']) {
      case "PLAYING":
        onCastState?.call(CastState.playing);
        break;
      case "PAUSED":
        onCastState?.call(CastState.paused);
        break;
      case "BUFFERING":
        onCastState?.call(CastState.buffering);
        break;
      case "IDLE":
        onCastState?.call(CastState.idle);

        // stop polling for media status if the video finished playing
        if (status["idleReason"] == "FINISHED") {
          _mediaStatusPollingTimer?.cancel();
        }

        break;
    }

    if (status["media"] != null && status["media"]["duration"] != null) {
      final duration = Duration(milliseconds: (status["media"]["duration"] * 1000 ?? 0).toInt());
      onDuration?.call(duration);
    }

    if (status["mediaSessionId"] != null) {
      _sessionId = status["mediaSessionId"];
    }

    if (status["currentTime"] != null) {
      final currentTime = Duration(milliseconds: (status["currentTime"] * 1000 ?? 0).toInt());
      onCurrentTime?.call(currentTime);
    }
  }

  Future<void> connect(dynamic device) async {
    await _gCastRepository.connect(device);

    onReceiverName?.call(device.extras["fn"] ?? "Google Cast");
  }

  CastDestinationType getType() {
    return CastDestinationType.googleCast;
  }

  Future<bool> initialize() async {
    // there is nothing blocking us from using Google Cast that we can check for
    return true;
  }

  Future<void> disconnect() async {
    onReceiverName?.call("");
    currentAssetId = null;
    await _gCastRepository.disconnect();
  }

  bool isSessionValid() {
    // check if we already have a session token
    // we should always have a expiration date
    if (sessionKey == null || sessionKey?.expiresAt == null) {
      return false;
    }

    final tokenExpiration = DateTime.parse(sessionKey!.expiresAt!);

    // we want to make sure we have at least 10 seconds remaining in the session
    // this is to account for network latency and other delays when sending the request
    final bufferedExpiration = tokenExpiration.subtract(const Duration(seconds: 10));

    return bufferedExpiration.isAfter(DateTime.now());
  }

  /// The LAN endpoint from Settings > Networking, normalised to the `/api`
  /// form of the server endpoint, or null when none is set.
  String? _localApiEndpoint() {
    var local = Store.tryGet(StoreKey.localEndpoint)?.trim();
    if (local == null || local.isEmpty) {
      return null;
    }
    while (local!.endsWith('/')) {
      local = local.substring(0, local.length - 1);
    }
    return local.endsWith('/api') ? local : '$local/api';
  }

  void loadMedia(RemoteAsset asset, bool reload) => _loadMedia(asset, reload);

  Future<void> _loadMedia(RemoteAsset asset, bool reload, {bool preferLocal = true}) async {
    if (!isConnected) {
      return;
    } else if (asset.id == currentAssetId && !reload) {
      return;
    }

    // create a session key
    if (!isSessionValid()) {
      sessionKey = await _sessionsApiService.createSession(
        "Cast",
        "Google Cast",
        duration: const Duration(minutes: 15).inSeconds,
      );
    }

    final unauthenticatedUrl = asset.isVideo
        ? getPlaybackUrlForRemoteId(asset.id)
        : getThumbnailUrlForRemoteId(asset.id, type: AssetMediaSize.fullsize);

    // Cast receivers (TVs) are usually on the home LAN and often cannot reach
    // the endpoint the phone uses (e.g. a Tailscale address), so point them at
    // the LAN endpoint when one is configured.
    final serverEndpoint = Store.get(StoreKey.serverEndpoint);
    final localEndpoint = preferLocal ? _localApiEndpoint() : null;
    final useLocal = localEndpoint != null && localEndpoint != serverEndpoint;
    final castUrl = useLocal ? unauthenticatedUrl.replaceFirst(serverEndpoint, localEndpoint) : unauthenticatedUrl;

    final authenticatedURL = "$castUrl&sessionKey=${sessionKey?.token}";

    // get image mime type
    final mimeType = await _assetApiRepository.getAssetMIMEType(asset.id);

    if (mimeType == null) {
      return;
    }

    _gCastRepository.sendMessage(CastSession.kNamespaceMedia, {
      "type": "LOAD",
      "media": {
        "contentId": authenticatedURL,
        "streamType": "BUFFERED",
        "contentType": mimeType,
        "contentUrl": authenticatedURL,
      },
      "autoplay": true,
    });

    currentAssetId = asset.id;
    _loadingAsset = asset;
    _loadedViaLocal = useLocal;

    // we need to poll for media status since the cast device does not
    // send a message when the media is loaded for whatever reason
    // only do this on videos
    _mediaStatusPollingTimer?.cancel();

    if (asset.isVideo) {
      _mediaStatusPollingTimer = Timer.periodic(const Duration(milliseconds: 500), (timer) {
        if (isConnected) {
          _gCastRepository.sendMessage(CastSession.kNamespaceMedia, {
            "type": "GET_STATUS",
            "mediaSessionId": _sessionId,
          });
        } else {
          timer.cancel();
        }
      });
    }
  }

  void play() {
    _gCastRepository.sendMessage(CastSession.kNamespaceMedia, {"type": "PLAY", "mediaSessionId": _sessionId});
  }

  void pause() {
    _gCastRepository.sendMessage(CastSession.kNamespaceMedia, {"type": "PAUSE", "mediaSessionId": _sessionId});
  }

  void seekTo(Duration position) {
    _gCastRepository.sendMessage(CastSession.kNamespaceMedia, {
      "type": "SEEK",
      "mediaSessionId": _sessionId,
      "currentTime": position.inSeconds,
    });
  }

  void stop() {
    _gCastRepository.sendMessage(CastSession.kNamespaceMedia, {"type": "STOP", "mediaSessionId": _sessionId});
    _mediaStatusPollingTimer?.cancel();

    currentAssetId = null;
  }

  // 0x01 is display capability bitmask
  bool isDisplay(int ca) => (ca & 0x01) != 0;

  Future<List<(String, CastDestinationType, dynamic)>> getDevices() async {
    final dests = await _gCastRepository.listDestinations();

    return dests
        .map((device) => (device.extras["fn"] ?? "Google Cast", CastDestinationType.googleCast, device))
        .where((device) {
          final caString = device.$3.extras["ca"];
          final caNumber = int.tryParse(caString ?? "0") ?? 0;

          return isDisplay(caNumber);
        })
        .toList(growable: false);
  }
}
