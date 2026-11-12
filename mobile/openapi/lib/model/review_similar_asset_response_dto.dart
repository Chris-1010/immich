//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;

class ReviewSimilarAssetResponseDto {
  /// Returns a new [ReviewSimilarAssetResponseDto] instance.
  ReviewSimilarAssetResponseDto({
    required this.assetId,
    required this.distance,
  });

  /// A library asset that looks like the pending asset.
  String assetId;

  /// Visual distance between the two; smaller is more alike.
  double distance;

  @override
  bool operator ==(Object other) => identical(this, other) || other is ReviewSimilarAssetResponseDto &&
    other.assetId == assetId &&
    other.distance == distance;

  @override
  int get hashCode =>
    // ignore: unnecessary_parenthesis
    (assetId.hashCode) +
    (distance.hashCode);

  @override
  String toString() => 'ReviewSimilarAssetResponseDto[assetId=$assetId, distance=$distance]';

  Map<String, dynamic> toJson() {
    final json = <String, dynamic>{};
      json[r'assetId'] = this.assetId;
      json[r'distance'] = this.distance;
    return json;
  }

  /// Returns a new [ReviewSimilarAssetResponseDto] instance and imports its values from
  /// [value] if it's a [Map], null otherwise.
  // ignore: prefer_constructors_over_static_methods
  static ReviewSimilarAssetResponseDto? fromJson(dynamic value) {
    upgradeDto(value, "ReviewSimilarAssetResponseDto");
    if (value is Map) {
      final json = value.cast<String, dynamic>();

      return ReviewSimilarAssetResponseDto(
        assetId: mapValueOfType<String>(json, r'assetId')!,
        distance: (mapValueOfType<num>(json, r'distance')!).toDouble(),
      );
    }
    return null;
  }

  static List<ReviewSimilarAssetResponseDto> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReviewSimilarAssetResponseDto>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReviewSimilarAssetResponseDto.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }

  static Map<String, ReviewSimilarAssetResponseDto> mapFromJson(dynamic json) {
    final map = <String, ReviewSimilarAssetResponseDto>{};
    if (json is Map && json.isNotEmpty) {
      json = json.cast<String, dynamic>(); // ignore: parameter_assignments
      for (final entry in json.entries) {
        final value = ReviewSimilarAssetResponseDto.fromJson(entry.value);
        if (value != null) {
          map[entry.key] = value;
        }
      }
    }
    return map;
  }

  // maps a json object with a list of ReviewSimilarAssetResponseDto-objects as value to a dart map
  static Map<String, List<ReviewSimilarAssetResponseDto>> mapListFromJson(dynamic json, {bool growable = false,}) {
    final map = <String, List<ReviewSimilarAssetResponseDto>>{};
    if (json is Map && json.isNotEmpty) {
      // ignore: parameter_assignments
      json = json.cast<String, dynamic>();
      for (final entry in json.entries) {
        map[entry.key] = ReviewSimilarAssetResponseDto.listFromJson(entry.value, growable: growable,);
      }
    }
    return map;
  }

  /// The list of required keys that must be present in a JSON.
  static const requiredKeys = <String>{
    'assetId',
    'distance',
  };
}

