//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ReviewEditsDto {
  /// Returns a new [ReviewEditsDto] instance.
  ReviewEditsDto({
    this.albumIds = const [],
    this.dateTimeOriginal,
    this.description,
    this.faces = const [],
    this.isFavorite,
    this.latitude,
    this.longitude,
    this.noLocation,
    this.rating,
  });

  /// Albums the asset is to be added to.
  List<String> albumIds;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? dateTimeOriginal;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  String? description;

  /// Face-to-person assignments to make.
  List<ReviewFaceEditDto> faces;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? isFavorite;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  double? latitude;

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  double? longitude;

  /// Mark the asset as deliberately having no location.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  bool? noLocation;

  /// Minimum value: -1
  /// Maximum value: 5
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  num? rating;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ReviewEditsDto &&
    _deepEquality.equals(other.albumIds, albumIds) &&
    other.dateTimeOriginal == dateTimeOriginal &&
    other.description == description &&
    _deepEquality.equals(other.faces, faces) &&
    other.isFavorite == isFavorite &&
    other.latitude == latitude &&
    other.longitude == longitude &&
    other.noLocation == noLocation &&
    other.rating == rating;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (albumIds.hashCode) +
    (dateTimeOriginal == null ? 0 : dateTimeOriginal!.hashCode) +
    (description == null ? 0 : description!.hashCode) +
    (faces.hashCode) +
    (isFavorite == null ? 0 : isFavorite!.hashCode) +
    (latitude == null ? 0 : latitude!.hashCode) +
    (longitude == null ? 0 : longitude!.hashCode) +
    (noLocation == null ? 0 : noLocation!.hashCode) +
    (rating == null ? 0 : rating!.hashCode);

  @override
  String toString() => 'ReviewEditsDto[albumIds=$albumIds, dateTimeOriginal=$dateTimeOriginal, description=$description, faces=$faces, isFavorite=$isFavorite, latitude=$latitude, longitude=$longitude, noLocation=$noLocation, rating=$rating]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'albumIds'] = this.albumIds;
    if (this.dateTimeOriginal != null) {
      json[r'dateTimeOriginal'] = this.dateTimeOriginal;
    } else {
    //  json[r'dateTimeOriginal'] = null;
    }
    if (this.description != null) {
      json[r'description'] = this.description;
    } else {
    //  json[r'description'] = null;
    }
      json[r'faces'] = this.faces;
    if (this.isFavorite != null) {
      json[r'isFavorite'] = this.isFavorite;
    } else {
    //  json[r'isFavorite'] = null;
    }
    if (this.latitude != null) {
      json[r'latitude'] = this.latitude;
    } else {
    //  json[r'latitude'] = null;
    }
    if (this.longitude != null) {
      json[r'longitude'] = this.longitude;
    } else {
    //  json[r'longitude'] = null;
    }
    if (this.noLocation != null) {
      json[r'noLocation'] = this.noLocation;
    } else {
    //  json[r'noLocation'] = null;
    }
    if (this.rating != null) {
      json[r'rating'] = this.rating;
    } else {
    //  json[r'rating'] = null;
    }
    return json;
  }

  /// Returns a new [ReviewEditsDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ReviewEditsDto? fromJson(dynamic value) {
    upgradeDto(value, "ReviewEditsDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return ReviewEditsDto(
        albumIds: json[r'albumIds'] is Iterable
            ? (json[r'albumIds'] as Iterable).cast<String>().toList(growable: false)
            : const [],
        dateTimeOriginal: mapValueOfType<String>(json, r'dateTimeOriginal'),
        description: mapValueOfType<String>(json, r'description'),
        faces: ReviewFaceEditDto.listFromJson(json[r'faces']),
        isFavorite: mapValueOfType<bool>(json, r'isFavorite'),
        latitude: (mapValueOfType<num>(json, r'latitude'))?.toDouble(),
        longitude: (mapValueOfType<num>(json, r'longitude'))?.toDouble(),
        noLocation: mapValueOfType<bool>(json, r'noLocation'),
        rating: json[r'rating'] == null
            ? null
            : num.parse('${json[r'rating']}'),
      );
    }
    return null;
  }

  static List<ReviewEditsDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReviewEditsDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReviewEditsDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ReviewEditsDto> mapFromJson(dynamic json) {
    final map = <String, ReviewEditsDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ReviewEditsDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ReviewEditsDto-objects as value to a dart map
  static Map<String, List<ReviewEditsDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ReviewEditsDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ReviewEditsDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

