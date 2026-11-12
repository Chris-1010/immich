//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class ReviewDecision {
  /// Instantiate a new enum with the provided [value].
  const ReviewDecision._(this.value);

  /// The underlying value of this enum member.
  final String value;

  @override
  String toString() => value;

  String toJson() => value;

  static const undecided = ReviewDecision._(r'undecided');
  static const keep = ReviewDecision._(r'keep');
  static const delete = ReviewDecision._(r'delete');

  /// List of all possible values in this [enum][ReviewDecision].
  static const values = <ReviewDecision>[
    undecided,
    keep,
    delete,
  ];

  static ReviewDecision? fromJson(dynamic value) => ReviewDecisionTypeTransformer().decode(value);

  static List<ReviewDecision> listFromJson(dynamic json, {bool growable = false,}) {
    final result = <ReviewDecision>[];
    if (json is List && json.isNotEmpty) {
      for (final row in json) {
        final value = ReviewDecision.fromJson(row);
        if (value != null) {
          result.add(value);
        }
      }
    }
    return result.toList(growable: growable);
  }
}

/// Transformation class that can [encode] an instance of [ReviewDecision] to String,
/// and [decode] dynamic data back to [ReviewDecision].
class ReviewDecisionTypeTransformer {
  factory ReviewDecisionTypeTransformer() => _instance ??= const ReviewDecisionTypeTransformer._();

  const ReviewDecisionTypeTransformer._();

  String encode(ReviewDecision data) => data.value;

  /// Decodes a [dynamic value][data] to a ReviewDecision.
  ///
  /// If [allowNull] is true and the [dynamic value][data] cannot be decoded successfully,
  /// then null is returned. However, if [allowNull] is false and the [dynamic value][data]
  /// cannot be decoded successfully, then an [UnimplementedError] is thrown.
  ///
  /// The [allowNull] is very handy when an API changes and a new enum value is added or removed,
  /// and users are still using an old app with the old code.
  ReviewDecision? decode(dynamic data, {bool allowNull = true}) {
    if (data != null) {
      switch (data) {
        case r'undecided': return ReviewDecision.undecided;
        case r'keep': return ReviewDecision.keep;
        case r'delete': return ReviewDecision.delete;
        default:
          if (!allowNull) {
            throw ArgumentError('Unknown enum value to decode: $data');
          }
      }
    }
    return null;
  }

  /// Singleton [ReviewDecisionTypeTransformer] instance.
  static ReviewDecisionTypeTransformer? _instance;
}

