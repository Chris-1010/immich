//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ReviewFinishResponseDto {
  /// Returns a new [ReviewFinishResponseDto] instance.
  ReviewFinishResponseDto({
    required this.deleted,
    required this.kept,
  });

  int deleted;

  int kept;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ReviewFinishResponseDto &&
    other.deleted == deleted &&
    other.kept == kept;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (deleted.hashCode) +
    (kept.hashCode);

  @override
  String toString() => 'ReviewFinishResponseDto[deleted=$deleted, kept=$kept]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'deleted'] = this.deleted;
      json[r'kept'] = this.kept;
    return json;
  }

  /// Returns a new [ReviewFinishResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ReviewFinishResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "ReviewFinishResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return ReviewFinishResponseDto(
        deleted: mapValueOfType<int>(json, r'deleted')!,
        kept: mapValueOfType<int>(json, r'kept')!,
      );
    }
    return null;
  }

  static List<ReviewFinishResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReviewFinishResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReviewFinishResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ReviewFinishResponseDto> mapFromJson(dynamic json) {
    final map = <String, ReviewFinishResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ReviewFinishResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ReviewFinishResponseDto-objects as value to a dart map
  static Map<String, List<ReviewFinishResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ReviewFinishResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ReviewFinishResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'deleted',
    'kept',
  };
}

