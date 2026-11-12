import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/utils/option.dart';
import 'package:immich_mobile/utils/timezone.dart';
import 'package:openapi/api.dart';

/// Matches the UTC offset closing an ISO 8601 date-time: `Z`, `+02:00` or `-0530`.
final _offsetPattern = RegExp(r'(Z|[+-]\d{2}:?\d{2})$', caseSensitive: false);

/// The wall-clock time and UTC offset written in an ISO 8601 date-time, or null when it does not parse.
///
/// The wall-clock time is returned as a UTC [DateTime] whose fields read as written, the same shape
/// [applyTimezoneOffset] returns for an offset zone. Without an offset the value is read as local time.
(DateTime, Duration)? parseStagedDateTime(String value) {
  final parsed = DateTime.tryParse(value.trim());
  if (parsed == null) {
    return null;
  }

  final match = _offsetPattern.firstMatch(value.trim());
  if (match == null) {
    final local = parsed.toLocal();
    return (local, local.timeZoneOffset);
  }

  final token = match.group(1)!;
  var offset = Duration.zero;
  if (token.toUpperCase() != 'Z') {
    final digits = token.substring(1).replaceAll(':', '');
    offset = Duration(hours: int.parse(digits.substring(0, 2)), minutes: int.parse(digits.substring(2, 4)));
    if (token.startsWith('-')) {
      offset = -offset;
    }
  }
  return (parsed.toUtc().add(offset), offset);
}

/// What the review details sheet shows for a pending asset: its own values (from `GET /assets/:id`)
/// with the staged edits laid over them, and which of them come from a staged edit.
class ReviewDetailsValues {
  /// Wall-clock date and time, as a [DateTime] whose fields read as shown.
  final DateTime dateTime;
  final Duration offset;

  /// Named time zone of the asset's own date, when known. Null for a staged date.
  final String? timeZone;
  final bool dateStaged;

  final String description;
  final String originalDescription;
  final bool descriptionStaged;

  final double? latitude;
  final double? longitude;

  /// Place name of the asset's own coordinates. Null when the location is staged.
  final String? city;
  final String? state;

  /// A staged "No Location" mark.
  final bool noLocation;
  final bool locationStaged;

  final int rating;
  final int originalRating;
  final bool ratingStaged;

  final bool isFavorite;
  final bool originalFavorite;
  final bool favoriteStaged;

  const ReviewDetailsValues({
    required this.dateTime,
    required this.offset,
    this.timeZone,
    this.dateStaged = false,
    this.description = '',
    this.originalDescription = '',
    this.descriptionStaged = false,
    this.latitude,
    this.longitude,
    this.city,
    this.state,
    this.noLocation = false,
    this.locationStaged = false,
    this.rating = 0,
    this.originalRating = 0,
    this.ratingStaged = false,
    this.isFavorite = false,
    this.originalFavorite = false,
    this.favoriteStaged = false,
  });

  factory ReviewDetailsValues.from(AssetResponseDto asset, ReviewEdits edits) {
    final exif = asset.exifInfo;

    // Same starting point as ActionService.editDateTime: the EXIF date in its own zone, else the
    // file date in device time.
    var dateTime = asset.fileCreatedAt.toLocal();
    var offset = dateTime.timeZoneOffset;
    String? timeZone;
    if (exif?.dateTimeOriginal != null) {
      timeZone = exif!.timeZone;
      (dateTime, offset) = applyTimezoneOffset(dateTime: exif.dateTimeOriginal!, timeZone: exif.timeZone);
    }

    var dateStaged = false;
    final stagedDate = edits.dateTimeOriginal == null ? null : parseStagedDateTime(edits.dateTimeOriginal!);
    if (stagedDate != null) {
      (dateTime, offset) = stagedDate;
      timeZone = null;
      dateStaged = true;
    }

    final originalDescription = exif?.description ?? '';
    final originalRating = exif?.rating?.toInt() ?? 0;
    final noLocation = edits.noLocation == true;
    final locationStaged = noLocation || edits.hasLocation;

    double? latitude = exif?.latitude?.toDouble();
    double? longitude = exif?.longitude?.toDouble();
    if (locationStaged) {
      latitude = noLocation ? null : edits.latitude;
      longitude = noLocation ? null : edits.longitude;
    }

    return ReviewDetailsValues(
      dateTime: dateTime,
      offset: offset,
      timeZone: timeZone,
      dateStaged: dateStaged,
      description: edits.description ?? originalDescription,
      originalDescription: originalDescription,
      descriptionStaged: edits.description != null,
      latitude: latitude,
      longitude: longitude,
      city: locationStaged ? null : exif?.city,
      state: locationStaged ? null : exif?.state,
      noLocation: noLocation,
      locationStaged: locationStaged,
      rating: edits.rating ?? originalRating,
      originalRating: originalRating,
      ratingStaged: edits.rating != null,
      isFavorite: edits.isFavorite ?? asset.isFavorite,
      originalFavorite: asset.isFavorite,
      favoriteStaged: edits.isFavorite != null,
    );
  }

  bool get hasCoordinates => latitude != null && longitude != null && (latitude != 0 || longitude != 0);

  /// Stage [value] as the description, or drop the staged one when it matches the asset's own.
  ReviewEditsPatch descriptionPatch(String value) =>
      ReviewEditsPatch(description: value == originalDescription ? const Option.none() : Option.some(value));

  /// Stage [value] as the rating, or drop the staged one when it matches the asset's own.
  ReviewEditsPatch ratingPatch(int value) =>
      ReviewEditsPatch(rating: value == originalRating ? const Option.none() : Option.some(value));

  /// Stage [value] as the favourite flag, or drop the staged one when it matches the asset's own.
  ReviewEditsPatch favoritePatch(bool value) =>
      ReviewEditsPatch(isFavorite: value == originalFavorite ? const Option.none() : Option.some(value));
}
