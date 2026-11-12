import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/presentation/widgets/review/review_details_values.dart';
import 'package:immich_mobile/utils/option.dart';
import 'package:openapi/api.dart';

AssetResponseDto _asset({ExifResponseDto? exif, bool isFavorite = false}) {
  final date = DateTime.utc(2024, 1, 2, 10);
  return AssetResponseDto(
    checksum: 'checksum',
    createdAt: date,
    deviceAssetId: 'device-asset',
    deviceId: 'device',
    duration: '0:00:00.00000',
    exifInfo: exif,
    fileCreatedAt: date,
    fileModifiedAt: date,
    hasMetadata: true,
    height: 100,
    id: 'asset-1',
    isArchived: false,
    isEdited: false,
    isFavorite: isFavorite,
    isOffline: false,
    isTrashed: false,
    localDateTime: date,
    originalFileName: 'IMG_0001.jpg',
    originalPath: '/upload/IMG_0001.jpg',
    ownerId: 'owner',
    thumbhash: null,
    type: AssetTypeEnum.IMAGE,
    updatedAt: date,
    visibility: AssetVisibility.timeline,
    width: 100,
  );
}

void main() {
  group('parseStagedDateTime', () {
    test('reads the wall-clock time and a positive offset', () {
      final (dateTime, offset) = parseStagedDateTime('2024-05-06T14:30:00+02:00')!;
      expect(offset, const Duration(hours: 2));
      expect((dateTime.year, dateTime.month, dateTime.day, dateTime.hour, dateTime.minute), (2024, 5, 6, 14, 30));
    });

    test('reads a negative offset without a colon', () {
      final (dateTime, offset) = parseStagedDateTime('2024-05-06T14:30:00-0530')!;
      expect(offset, const Duration(hours: -5, minutes: -30));
      expect((dateTime.hour, dateTime.minute), (14, 30));
    });

    test('reads Z as UTC', () {
      final (dateTime, offset) = parseStagedDateTime('2024-05-06T14:30:00Z')!;
      expect(offset, Duration.zero);
      expect(dateTime.hour, 14);
    });

    test('returns null for an unparseable value', () {
      expect(parseStagedDateTime('not a date'), isNull);
    });
  });

  group('ReviewDetailsValues.from', () {
    final exif = ExifResponseDto(
      description: 'Beach',
      latitude: 51.5,
      longitude: -0.1,
      city: 'London',
      state: 'England',
      rating: 3,
      dateTimeOriginal: DateTime.utc(2024, 1, 2, 9),
    );

    test('shows the asset values when nothing is staged', () {
      final values = ReviewDetailsValues.from(_asset(exif: exif, isFavorite: true), ReviewEdits.empty);

      expect(values.description, 'Beach');
      expect(values.descriptionStaged, isFalse);
      expect((values.latitude, values.longitude, values.city), (51.5, -0.1, 'London'));
      expect(values.locationStaged, isFalse);
      expect(values.rating, 3);
      expect(values.ratingStaged, isFalse);
      expect(values.isFavorite, isTrue);
      expect(values.favoriteStaged, isFalse);
      expect(values.dateStaged, isFalse);
      expect(values.dateTime.hour, 9);
    });

    test('lays staged edits over the asset values', () {
      final values = ReviewDetailsValues.from(
        _asset(exif: exif),
        const ReviewEdits(
          description: 'Sunset',
          dateTimeOriginal: '2023-07-08T20:15:00+01:00',
          latitude: 48.8,
          longitude: 2.3,
          rating: 5,
          isFavorite: true,
        ),
      );

      expect((values.description, values.descriptionStaged), ('Sunset', true));
      expect((values.dateTime.year, values.dateTime.hour, values.offset), (2023, 20, const Duration(hours: 1)));
      expect(values.dateStaged, isTrue);
      expect(values.timeZone, isNull);
      expect((values.latitude, values.longitude, values.city), (48.8, 2.3, null));
      expect(values.locationStaged, isTrue);
      expect((values.rating, values.ratingStaged), (5, true));
      expect((values.isFavorite, values.favoriteStaged), (true, true));
    });

    test('a staged No Location mark hides the asset coordinates', () {
      final values = ReviewDetailsValues.from(_asset(exif: exif), const ReviewEdits(noLocation: true));

      expect(values.noLocation, isTrue);
      expect(values.locationStaged, isTrue);
      expect(values.hasCoordinates, isFalse);
    });

    test('an asset without EXIF falls back to empty values', () {
      final values = ReviewDetailsValues.from(_asset(), ReviewEdits.empty);

      expect(values.description, '');
      expect(values.rating, 0);
      expect(values.hasCoordinates, isFalse);
    });
  });

  group('patches', () {
    final values = ReviewDetailsValues.from(
      _asset(exif: ExifResponseDto(description: 'Beach', rating: 3)),
      ReviewEdits.empty,
    );

    test('stage a changed value', () {
      expect(values.descriptionPatch('Sunset').description, const Option.some('Sunset'));
      expect(values.ratingPatch(5).rating, const Option.some(5));
      expect(values.favoritePatch(true).isFavorite, const Option.some(true));
    });

    test('drop the staged value when it matches the asset value', () {
      expect(values.descriptionPatch('Beach').description, isA<None<String>>());
      expect(values.ratingPatch(3).rating, isA<None<int>>());
      expect(values.favoritePatch(false).isFavorite, isA<None<bool>>());
    });
  });
}
