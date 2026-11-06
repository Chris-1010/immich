import 'package:drift/drift.dart' as drift;
import 'package:drift/native.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/store.model.dart';
import 'package:immich_mobile/domain/services/store.service.dart';
import 'package:immich_mobile/entities/store.entity.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';
import 'package:immich_mobile/infrastructure/repositories/store.repository.dart';
import 'package:immich_mobile/repositories/download.repository.dart';
import 'package:immich_mobile/repositories/saved_location_api.repository.dart';
import 'package:immich_mobile/services/action.service.dart';
import 'package:immich_mobile/widgets/common/location_picker.dart';
import 'package:maplibre_gl/maplibre_gl.dart';
import 'package:mocktail/mocktail.dart';

import '../infrastructure/repository.mock.dart';
import '../repository.mocks.dart';

class MockDownloadRepository extends Mock implements DownloadRepository {}

class MockSavedLocationApiRepository extends Mock implements SavedLocationApiRepository {}

void main() {
  late ActionService sut;

  late MockAssetApiRepository assetApiRepository;
  late MockRemoteAssetRepository remoteAssetRepository;
  late MockDriftLocalAssetRepository localAssetRepository;
  late MockDriftAlbumApiRepository albumApiRepository;
  late MockRemoteAlbumRepository remoteAlbumRepository;
  late MockTrashedLocalAssetRepository trashedLocalAssetRepository;
  late MockAssetMediaRepository assetMediaRepository;
  late MockDownloadRepository downloadRepository;
  late MockSavedLocationApiRepository savedLocationApiRepository;

  late Drift db;

  setUpAll(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    debugDefaultTargetPlatformOverride = TargetPlatform.android;

    db = Drift(drift.DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
    await StoreService.init(storeRepository: DriftStoreRepository(db));
  });

  tearDownAll(() async {
    debugDefaultTargetPlatformOverride = null;
    await Store.clear();
    await db.close();
  });

  setUp(() {
    assetApiRepository = MockAssetApiRepository();
    remoteAssetRepository = MockRemoteAssetRepository();
    localAssetRepository = MockDriftLocalAssetRepository();
    albumApiRepository = MockDriftAlbumApiRepository();
    remoteAlbumRepository = MockRemoteAlbumRepository();
    trashedLocalAssetRepository = MockTrashedLocalAssetRepository();
    assetMediaRepository = MockAssetMediaRepository();
    downloadRepository = MockDownloadRepository();
    savedLocationApiRepository = MockSavedLocationApiRepository();

    sut = ActionService(
      assetApiRepository,
      remoteAssetRepository,
      localAssetRepository,
      albumApiRepository,
      remoteAlbumRepository,
      trashedLocalAssetRepository,
      assetMediaRepository,
      downloadRepository,
      savedLocationApiRepository,
    );
  });

  tearDown(() async {
    await Store.clear();
  });

  group('ActionService.deleteLocal', () {
    test('routes deleted ids to trashed repository when Android trash handling is enabled', () async {
      await Store.put(StoreKey.manageLocalMediaAndroid, true);
      const ids = ['a', 'b'];

      when(() => assetMediaRepository.deleteAll(ids)).thenAnswer((_) async => ids);
      when(() => trashedLocalAssetRepository.applyTrashedAssets(ids)).thenAnswer((_) async {});

      final result = await sut.deleteLocal(ids);

      expect(result, ids.length);
      verify(() => assetMediaRepository.deleteAll(ids)).called(1);
      verify(() => trashedLocalAssetRepository.applyTrashedAssets(ids)).called(1);
      verifyNever(() => localAssetRepository.delete(any()));
    });

    test('deletes locally when Android trash handling is disabled', () async {
      await Store.put(StoreKey.manageLocalMediaAndroid, false);
      const ids = ['c'];

      when(() => assetMediaRepository.deleteAll(ids)).thenAnswer((_) async => ids);
      when(() => localAssetRepository.delete(ids)).thenAnswer((_) async {});

      final result = await sut.deleteLocal(ids);

      expect(result, ids.length);
      verify(() => assetMediaRepository.deleteAll(ids)).called(1);
      verify(() => localAssetRepository.delete(ids)).called(1);
      verifyNever(() => trashedLocalAssetRepository.applyTrashedAssets(any()));
    });

    test('short-circuits when nothing was deleted', () async {
      await Store.put(StoreKey.manageLocalMediaAndroid, true);
      const ids = ['x'];

      when(() => assetMediaRepository.deleteAll(ids)).thenAnswer((_) async => <String>[]);

      final result = await sut.deleteLocal(ids);

      expect(result, 0);
      verify(() => assetMediaRepository.deleteAll(ids)).called(1);
      verifyNever(() => trashedLocalAssetRepository.applyTrashedAssets(any()));
      verifyNever(() => localAssetRepository.delete(any()));
    });
  });

  group('ActionService.applyLocation', () {
    const ids = ['a1', 'a2'];

    setUpAll(() => registerFallbackValue(const LatLng(0, 0)));

    test('a picked point updates the server and the local copy', () async {
      const point = LatLng(53.35, -6.26);
      when(() => assetApiRepository.updateLocation(ids, point)).thenAnswer((_) async {});
      when(() => remoteAssetRepository.updateLocation(ids, point)).thenAnswer((_) async {});

      await sut.applyLocation(ids, const PickedPoint(point));

      verify(() => assetApiRepository.updateLocation(ids, point)).called(1);
      verify(() => remoteAssetRepository.updateLocation(ids, point)).called(1);
      verifyZeroInteractions(savedLocationApiRepository);
    });

    test('No Location marks the assets on the server and clears their local coordinates', () async {
      when(() => savedLocationApiRepository.markNoLocation(ids)).thenAnswer((_) async {});
      when(() => remoteAssetRepository.clearLocation(ids)).thenAnswer((_) async {});

      await sut.applyLocation(ids, const PickedNoLocation(true));

      verify(() => savedLocationApiRepository.markNoLocation(ids)).called(1);
      verify(() => remoteAssetRepository.clearLocation(ids)).called(1);
      verifyNever(() => assetApiRepository.updateLocation(any(), any()));
    });

    test('Unassign Location clears the marker on the server only', () async {
      when(() => savedLocationApiRepository.unassignNoLocation('a1')).thenAnswer((_) async {});

      await sut.applyLocation(['a1'], const PickedNoLocation(false));

      verify(() => savedLocationApiRepository.unassignNoLocation('a1')).called(1);
      verifyZeroInteractions(remoteAssetRepository);
    });
  });
}
