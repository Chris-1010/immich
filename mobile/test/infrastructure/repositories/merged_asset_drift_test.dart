import 'package:drift/drift.dart';
import 'package:drift/native.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/asset/base_asset.model.dart';
import 'package:immich_mobile/domain/models/timeline.model.dart';
import 'package:immich_mobile/infrastructure/entities/remote_asset.entity.drift.dart';
import 'package:immich_mobile/infrastructure/entities/user.entity.drift.dart';
import 'package:immich_mobile/infrastructure/repositories/db.repository.dart';

void main() {
  late Drift db;

  setUp(() {
    db = Drift(DatabaseConnection(NativeDatabase.memory(), closeStreamsSynchronously: true));
  });

  tearDown(() async {
    await db.close();
  });

  test('mergedBucket falls back to createdAt when localDateTime is null', () async {
    const userId = 'user-1';
    final createdAt = DateTime(2024, 1, 1, 12);

    await db
        .into(db.userEntity)
        .insert(UserEntityCompanion.insert(id: userId, email: 'user-1@test.dev', name: 'User 1'));

    await db
        .into(db.remoteAssetEntity)
        .insert(
          RemoteAssetEntityCompanion.insert(
            id: 'asset-1',
            name: 'asset-1.jpg',
            type: AssetType.image,
            checksum: 'checksum-1',
            ownerId: userId,
            visibility: AssetVisibility.timeline,
            createdAt: Value(createdAt),
            updatedAt: Value(createdAt),
            localDateTime: const Value(null),
          ),
        );

    final buckets = await db.mergedAssetDrift
        .mergedBucket(groupBy: GroupAssetsBy.day.index, sortBy: 0, userIds: [userId])
        .get();

    expect(buckets, hasLength(1));
    expect(buckets.single.assetCount, 1);
    expect(buckets.single.bucketDate, isNotEmpty);
  });

  group('sorting by date added', () {
    const userId = 'user-1';
    // Taken in 2020 but uploaded in 2024
    final oldPhotoTaken = DateTime.utc(2020, 6, 1, 12);
    final oldPhotoUploaded = DateTime.utc(2024, 3, 10, 12);
    // Taken and uploaded in 2023
    final newerPhoto = DateTime.utc(2023, 5, 1, 12);

    setUp(() async {
      await db
          .into(db.userEntity)
          .insert(UserEntityCompanion.insert(id: userId, email: 'user-1@test.dev', name: 'User 1'));

      Future<void> insert(String id, DateTime taken, DateTime? uploaded) => db
          .into(db.remoteAssetEntity)
          .insert(
            RemoteAssetEntityCompanion.insert(
              id: id,
              name: '$id.jpg',
              type: AssetType.image,
              checksum: 'checksum-$id',
              ownerId: userId,
              visibility: AssetVisibility.timeline,
              createdAt: Value(taken),
              updatedAt: Value(taken),
              localDateTime: Value(taken),
              uploadedAt: Value(uploaded),
            ),
          );

      await insert('old-photo', oldPhotoTaken, oldPhotoUploaded);
      await insert('newer-photo', newerPhoto, newerPhoto);
    });

    Future<List<String?>> assetOrder(int sortBy) async {
      final rows = await db.mergedAssetDrift
          .mergedAsset(userIds: [userId], sortBy: sortBy, limit: (_) => Limit(10, 0))
          .get();
      return rows.map((row) => row.remoteId).toList();
    }

    Future<List<String>> bucketOrder(int sortBy) async {
      final rows = await db.mergedAssetDrift
          .mergedBucket(groupBy: GroupAssetsBy.month.index, sortBy: sortBy, userIds: [userId])
          .get();
      return rows.map((row) => row.bucketDate).toList();
    }

    test('date taken orders by when the photo was taken', () async {
      expect(await assetOrder(0), ['newer-photo', 'old-photo']);
      expect(await bucketOrder(0), ['2023-05', '2020-06']);
    });

    test('date added orders and groups by when the photo was uploaded', () async {
      expect(await assetOrder(1), ['old-photo', 'newer-photo']);
      expect(await bucketOrder(1), ['2024-03', '2023-05']);
    });

    test('date added falls back to the date taken when the upload date is unknown', () async {
      await (db.update(
        db.remoteAssetEntity,
      )..where((row) => row.id.equals('old-photo'))).write(const RemoteAssetEntityCompanion(uploadedAt: Value(null)));

      expect(await assetOrder(1), ['newer-photo', 'old-photo']);
      expect(await bucketOrder(1), ['2023-05', '2020-06']);
    });
  });
}
