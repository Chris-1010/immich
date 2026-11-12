//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ReviewFaceEditDto {
  /// Returns a new [ReviewFaceEditDto] instance.
  ReviewFaceEditDto({
    required this.faceId,
    required this.personId,
  });

  /// A face detected on the pending asset.
  String faceId;

  /// The person the face is to be assigned to when the asset is kept.
  String personId;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ReviewFaceEditDto &&
    other.faceId == faceId &&
    other.personId == personId;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (faceId.hashCode) +
    (personId.hashCode);

  @override
  String toString() => 'ReviewFaceEditDto[faceId=$faceId, personId=$personId]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'faceId'] = this.faceId;
      json[r'personId'] = this.personId;
    return json;
  }

  /// Returns a new [ReviewFaceEditDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ReviewFaceEditDto? fromJson(dynamic value) {
    upgradeDto(value, "ReviewFaceEditDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return ReviewFaceEditDto(
        faceId: mapValueOfType<String>(json, r'faceId')!,
        personId: mapValueOfType<String>(json, r'personId')!,
      );
    }
    return null;
  }

  static List<ReviewFaceEditDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReviewFaceEditDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReviewFaceEditDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ReviewFaceEditDto> mapFromJson(dynamic json) {
    final map = <String, ReviewFaceEditDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ReviewFaceEditDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ReviewFaceEditDto-objects as value to a dart map
  static Map<String, List<ReviewFaceEditDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ReviewFaceEditDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ReviewFaceEditDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'faceId',
    'personId',
  };
}

