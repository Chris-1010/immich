//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ReviewUpdateDto {
  /// Returns a new [ReviewUpdateDto] instance.
  ReviewUpdateDto({
    this.decision,
    this.edits,
  });

  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  ReviewDecision? decision;

  /// Replaces every staged edit on the asset.
  ///
  /// Please note: This property should have been non-nullable! Since the specification file
  /// does not include a default value (using the "default:" property), however, the generated
  /// source code must fall back to having a nullable type.
  /// Consider adding a "default:" property in the specification file to hide this note.
  ///
  ReviewEditsDto? edits;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ReviewUpdateDto &&
    other.decision == decision &&
    other.edits == edits;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (decision == null ? 0 : decision!.hashCode) +
    (edits == null ? 0 : edits!.hashCode);

  @override
  String toString() => 'ReviewUpdateDto[decision=$decision, edits=$edits]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
    if (this.decision != null) {
      json[r'decision'] = this.decision;
    } else {
    //  json[r'decision'] = null;
    }
    if (this.edits != null) {
      json[r'edits'] = this.edits;
    } else {
    //  json[r'edits'] = null;
    }
    return json;
  }

  /// Returns a new [ReviewUpdateDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ReviewUpdateDto? fromJson(dynamic value) {
    upgradeDto(value, "ReviewUpdateDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return ReviewUpdateDto(
        decision: ReviewDecision.fromJson(json[r'decision']),
        edits: ReviewEditsDto.fromJson(json[r'edits']),
      );
    }
    return null;
  }

  static List<ReviewUpdateDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReviewUpdateDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReviewUpdateDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ReviewUpdateDto> mapFromJson(dynamic json) {
    final map = <String, ReviewUpdateDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ReviewUpdateDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ReviewUpdateDto-objects as value to a dart map
  static Map<String, List<ReviewUpdateDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ReviewUpdateDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ReviewUpdateDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
  };
}

