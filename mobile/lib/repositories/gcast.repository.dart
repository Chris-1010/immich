import 'package:cast/device.dart';
import 'package:cast/session.dart';
import 'package:cast/session_manager.dart';
import 'package:cast/discovery_service.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:logging/logging.dart';

final gCastRepositoryProvider = Provider((_) {
  return GCastRepository();
});

class GCastRepository {
  final _log = Logger('GCastRepository');
  CastSession? _castSession;

  void Function(CastSessionState)? onCastStatus;
  void Function(Map<String, dynamic>)? onCastMessage;

  Map<String, dynamic>? _receiverStatus;

  GCastRepository();

  Future<void> connect(CastDevice device) async {
    _castSession = await CastSessionManager().startSession(device);

    _castSession?.stateStream.listen((state) {
      onCastStatus?.call(state);
    });

    _castSession?.messageStream.listen((message) {
      onCastMessage?.call(message);
      if (message['type'] == 'RECEIVER_STATUS') {
        _receiverStatus = message;
      }
    });

    // open the default receiver
    sendMessage(CastSession.kNamespaceReceiver, {'type': 'LAUNCH', 'appId': 'CC1AD845'});
  }

  Future<void> disconnect() async {
    final session = _castSession;
    if (session == null) {
      return;
    }

    // Detach first so repeated taps on "stop casting" and late play/pause calls
    // do not reach a socket that is being torn down.
    final sessionID = getSessionId();
    _castSession = null;
    _receiverStatus = null;

    try {
      if (session.state != CastSessionState.closed) {
        session.sendMessage(CastSession.kNamespaceReceiver, {'type': "STOP", "sessionId": sessionID});

        // wait 500ms to ensure the stop command is processed
        await Future.delayed(const Duration(milliseconds: 500));
      }

      await session.close();
    } catch (error) {
      // The receiver usually closes the connection itself once it has stopped,
      // so the socket may already be gone; there is nothing left to tear down.
      _log.fine('Cast session already closed while disconnecting: $error');
    }
  }

  String? getSessionId() {
    if (_receiverStatus == null) {
      return null;
    }
    return _receiverStatus!['status']['applications'][0]['sessionId'];
  }

  void sendMessage(String namespace, Map<String, dynamic> message) {
    final session = _castSession;
    if (session == null || session.state == CastSessionState.closed) {
      _log.fine('Dropping ${message['type']} message: no open cast session');
      return;
    }

    try {
      session.sendMessage(namespace, message);
    } catch (error) {
      // The receiver can close the socket at any moment (e.g. when it is turned
      // off or stops the app), before the session reports itself closed.
      _log.warning('Failed to send ${message['type']} message to the cast receiver: $error');
    }
  }

  Future<List<CastDevice>> listDestinations() async {
    return await CastDiscoveryService().search(timeout: const Duration(seconds: 3));
  }
}
