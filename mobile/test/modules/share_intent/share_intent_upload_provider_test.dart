import 'package:auto_route/auto_route.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/models/upload/share_intent_attachment.model.dart';
import 'package:immich_mobile/providers/asset_viewer/share_intent_upload.provider.dart';
import 'package:immich_mobile/repositories/asset_api.repository.dart';
import 'package:immich_mobile/repositories/saved_location_api.repository.dart';
import 'package:immich_mobile/routing/router.dart';
import 'package:immich_mobile/services/foreground_upload.service.dart';
import 'package:immich_mobile/services/share_intent_service.dart';
import 'package:mocktail/mocktail.dart';

class _MockAppRouter extends Mock implements AppRouter {}

class _MockForegroundUploadService extends Mock implements ForegroundUploadService {}

class _MockShareIntentService extends Mock implements ShareIntentService {}

class _MockAssetApiRepository extends Mock implements AssetApiRepository {}

class _MockSavedLocationApiRepository extends Mock implements SavedLocationApiRepository {}

class _FakePageRouteInfo extends Fake implements PageRouteInfo {}

void main() {
  late _MockAppRouter router;
  late ShareIntentUploadStateNotifier notifier;
  late _MockSavedLocationApiRepository savedLocationApiRepository;

  final attachments = [
    ShareIntentAttachment(path: '/tmp/a.jpg', type: ShareIntentAttachmentType.image, status: UploadStatus.enqueued),
  ];

  setUpAll(() {
    registerFallbackValue(_FakePageRouteInfo());
  });

  setUp(() {
    savedLocationApiRepository = _MockSavedLocationApiRepository();
    router = _MockAppRouter();
    when(() => router.push(any())).thenAnswer((_) async => null);
    when(() => router.removeWhere(any())).thenReturn(false);
    notifier = ShareIntentUploadStateNotifier(
      router,
      _MockForegroundUploadService(),
      _MockShareIntentService(),
      _MockAssetApiRepository(),
      savedLocationApiRepository,
    );
  });

  group('share received during startup', () {
    test('is held until the app leaves the splash screen', () {
      notifier.onRouteChanged(SplashScreenRoute.name);
      notifier.onSharedMedia(attachments);

      verifyNever(() => router.push(any()));
      expect(notifier.state, isEmpty);

      notifier.onRouteChanged(TabShellRoute.name);

      verify(() => router.push(any(that: isA<ShareIntentRoute>()))).called(1);
      expect(notifier.state, attachments);
    });

    test('is held before any route has been shown', () {
      notifier.onSharedMedia(attachments);
      verifyNever(() => router.push(any()));

      notifier.onRouteChanged(LoginRoute.name);
      verifyNever(() => router.push(any()));

      notifier.onRouteChanged(TabShellRoute.name);
      verify(() => router.push(any(that: isA<ShareIntentRoute>()))).called(1);
    });

    test('is shown only once', () {
      notifier.onSharedMedia(attachments);
      notifier.onRouteChanged(TabShellRoute.name);
      notifier.onRouteChanged(ShareIntentRoute.name);
      notifier.onRouteChanged(TabShellRoute.name);

      verify(() => router.push(any(that: isA<ShareIntentRoute>()))).called(1);
    });
  });

  test('share received while the app is running is shown immediately', () {
    notifier.onRouteChanged(TabShellRoute.name);
    notifier.onSharedMedia(attachments);

    verify(() => router.push(any(that: isA<ShareIntentRoute>()))).called(1);
  });

  test('share received after a dialog or sheet was opened is shown immediately', () {
    notifier.onRouteChanged(TabShellRoute.name);
    // Dialogs, bottom sheets and menus push routes without a name.
    notifier.onRouteChanged(null);
    notifier.onSharedMedia(attachments);

    verify(() => router.push(any(that: isA<ShareIntentRoute>()))).called(1);
  });

  test('share received after signing out is held until the app is back past login', () {
    notifier.onRouteChanged(TabShellRoute.name);
    notifier.onRouteChanged(LoginRoute.name);
    notifier.onRouteChanged(null);
    notifier.onSharedMedia(attachments);
    verifyNever(() => router.push(any()));

    notifier.onRouteChanged(TabShellRoute.name);
    verify(() => router.push(any(that: isA<ShareIntentRoute>()))).called(1);
  });

  group('ShareIntentAssetDetails', () {
    test('placeName joins the known parts', () {
      expect(const ShareIntentAssetDetails(city: 'Dublin', country: 'Ireland').placeName, 'Dublin, Ireland');
      expect(const ShareIntentAssetDetails(city: '', state: 'Leinster').placeName, 'Leinster');
      expect(const ShareIntentAssetDetails().placeName, isNull);
    });

    test('isToday compares the calendar date', () {
      expect(ShareIntentAssetDetails(dateTime: DateTime.now()).isToday, isTrue);
      expect(ShareIntentAssetDetails(dateTime: DateTime.now().subtract(const Duration(days: 1))).isToday, isFalse);
      expect(const ShareIntentAssetDetails().isToday, isFalse);
    });
  });

  test('copyWith keeps the file length', () {
    final attachment = ShareIntentAttachment(
      path: '/tmp/a.jpg',
      type: ShareIntentAttachmentType.image,
      status: UploadStatus.enqueued,
      fileLength: 2048,
    );
    expect(attachment.copyWith(status: UploadStatus.complete).fileLength, 2048);
  });

  group('setNoLocation', () {
    final uploaded = ShareIntentAttachment(
      path: '/tmp/b.jpg',
      type: ShareIntentAttachmentType.image,
      status: UploadStatus.complete,
      remoteAssetId: 'remote-b',
      details: const ShareIntentAssetDetails(latitude: 53.3, longitude: -6.2, city: 'Dublin'),
    );

    setUp(() {
      notifier.onRouteChanged(TabShellRoute.name);
      notifier.onSharedMedia([uploaded]);
    });

    test('marking clears the coordinates and place name', () async {
      when(() => savedLocationApiRepository.markNoLocation(['remote-b'])).thenAnswer((_) async {});

      await notifier.setNoLocation([uploaded], true);

      verify(() => savedLocationApiRepository.markNoLocation(['remote-b'])).called(1);
      final details = notifier.state.single.details!;
      expect(details.isNoLocation, isTrue);
      expect(details.hasLocation, isFalse);
      expect(details.placeName, isNull);
      expect(details.isLocationEdited, isTrue);
    });

    test('unassigning clears the marker', () async {
      when(() => savedLocationApiRepository.unassignNoLocation('remote-b')).thenAnswer((_) async {});

      await notifier.setNoLocation([uploaded], false);

      verify(() => savedLocationApiRepository.unassignNoLocation('remote-b')).called(1);
      expect(notifier.state.single.details!.isNoLocation, isFalse);
    });
  });
}
