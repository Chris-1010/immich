import 'package:collection/collection.dart';
import 'package:immich_mobile/utils/option.dart';

/// What the user has chosen for a pending asset. A mark, not an action: it can change freely until
/// the review is finished.
enum PendingDecision { undecided, keep, delete }

/// A face-to-person assignment staged against a pending asset.
class ReviewFaceEdit {
  final String faceId;
  final String personId;

  const ReviewFaceEdit({required this.faceId, required this.personId});

  @override
  bool operator ==(Object other) => other is ReviewFaceEdit && other.faceId == faceId && other.personId == personId;

  @override
  int get hashCode => Object.hash(faceId, personId);

  @override
  String toString() => 'ReviewFaceEdit($faceId -> $personId)';
}

/// Changes held aside for a pending asset and applied only if it is kept at Finish review.
///
/// A `null` field means "no staged change". The server replaces every staged edit on each update,
/// so a change is always merged into the full set (see [merge]) before it is sent.
class ReviewEdits {
  final String? description;

  /// ISO 8601 date-time, passed through to the server as entered.
  final String? dateTimeOriginal;
  final double? latitude;
  final double? longitude;
  final bool? noLocation;
  final int? rating;
  final bool? isFavorite;
  final List<String> albumIds;
  final List<ReviewFaceEdit> faces;

  const ReviewEdits({
    this.description,
    this.dateTimeOriginal,
    this.latitude,
    this.longitude,
    this.noLocation,
    this.rating,
    this.isFavorite,
    this.albumIds = const [],
    this.faces = const [],
  });

  static const empty = ReviewEdits();

  bool get isEmpty => this == empty;

  bool get hasLocation => latitude != null && longitude != null;

  /// Lay [patch] over these edits. Fields the patch does not mention are kept as they are.
  ReviewEdits merge(ReviewEditsPatch patch) {
    T? pick<T>(Option<T>? change, T? current) => change == null ? current : change.unwrapOrNull;

    return ReviewEdits(
      description: pick(patch.description, description),
      dateTimeOriginal: pick(patch.dateTimeOriginal, dateTimeOriginal),
      latitude: pick(patch.latitude, latitude),
      longitude: pick(patch.longitude, longitude),
      noLocation: pick(patch.noLocation, noLocation),
      rating: pick(patch.rating, rating),
      isFavorite: pick(patch.isFavorite, isFavorite),
      albumIds: patch.albumIds ?? albumIds,
      faces: patch.faces ?? faces,
    );
  }

  static const _listEquality = ListEquality();

  @override
  bool operator ==(Object other) =>
      other is ReviewEdits &&
      other.description == description &&
      other.dateTimeOriginal == dateTimeOriginal &&
      other.latitude == latitude &&
      other.longitude == longitude &&
      other.noLocation == noLocation &&
      other.rating == rating &&
      other.isFavorite == isFavorite &&
      _listEquality.equals(other.albumIds, albumIds) &&
      _listEquality.equals(other.faces, faces);

  @override
  int get hashCode => Object.hash(
    description,
    dateTimeOriginal,
    latitude,
    longitude,
    noLocation,
    rating,
    isFavorite,
    _listEquality.hash(albumIds),
    _listEquality.hash(faces),
  );

  @override
  String toString() =>
      'ReviewEdits(description: $description, dateTimeOriginal: $dateTimeOriginal, latitude: $latitude, '
      'longitude: $longitude, noLocation: $noLocation, rating: $rating, isFavorite: $isFavorite, '
      'albumIds: $albumIds, faces: $faces)';
}

/// A partial change to [ReviewEdits].
///
/// For each scalar field: `null` leaves the staged value alone, `Option.some(v)` sets it and
/// `Option.none()` clears it. For the lists, `null` leaves them alone and any list replaces them.
class ReviewEditsPatch {
  final Option<String>? description;
  final Option<String>? dateTimeOriginal;
  final Option<double>? latitude;
  final Option<double>? longitude;
  final Option<bool>? noLocation;
  final Option<int>? rating;
  final Option<bool>? isFavorite;
  final List<String>? albumIds;
  final List<ReviewFaceEdit>? faces;

  const ReviewEditsPatch({
    this.description,
    this.dateTimeOriginal,
    this.latitude,
    this.longitude,
    this.noLocation,
    this.rating,
    this.isFavorite,
    this.albumIds,
    this.faces,
  });

  /// Stage a picked point, dropping any staged "no location" mark.
  ReviewEditsPatch.location(double latitude, double longitude)
    : this(latitude: Option.some(latitude), longitude: Option.some(longitude), noLocation: const Option.none());

  /// Stage the asset as deliberately having no location, dropping any staged point.
  const ReviewEditsPatch.noLocation()
    : this(latitude: const Option.none(), longitude: const Option.none(), noLocation: const Option.some(true));

  /// Drop every staged location change, so the asset keeps whatever location it has.
  const ReviewEditsPatch.clearLocation()
    : this(latitude: const Option.none(), longitude: const Option.none(), noLocation: const Option.none());
}

/// A pending asset as the review screen holds it.
class ReviewItem {
  final String assetId;
  final PendingDecision decision;
  final ReviewEdits edits;
  final DateTime createdAt;
  final DateTime updatedAt;

  const ReviewItem({
    required this.assetId,
    required this.decision,
    this.edits = ReviewEdits.empty,
    required this.createdAt,
    required this.updatedAt,
  });

  bool get isUndecided => decision == PendingDecision.undecided;

  ReviewItem copyWith({PendingDecision? decision, ReviewEdits? edits, DateTime? updatedAt}) => ReviewItem(
    assetId: assetId,
    decision: decision ?? this.decision,
    edits: edits ?? this.edits,
    createdAt: createdAt,
    updatedAt: updatedAt ?? this.updatedAt,
  );

  @override
  bool operator ==(Object other) =>
      other is ReviewItem &&
      other.assetId == assetId &&
      other.decision == decision &&
      other.edits == edits &&
      other.createdAt == createdAt &&
      other.updatedAt == updatedAt;

  @override
  int get hashCode => Object.hash(assetId, decision, edits, createdAt, updatedAt);

  @override
  String toString() => 'ReviewItem($assetId, $decision, $edits)';
}

/// A library asset that looks like a pending one. Lower [distance] is closer.
class ReviewSimilarAsset {
  final String assetId;
  final double distance;

  const ReviewSimilarAsset({required this.assetId, required this.distance});

  @override
  bool operator ==(Object other) =>
      other is ReviewSimilarAsset && other.assetId == assetId && other.distance == distance;

  @override
  int get hashCode => Object.hash(assetId, distance);
}

/// What Finish review did.
class ReviewFinishResult {
  final int kept;
  final int deleted;

  const ReviewFinishResult({required this.kept, required this.deleted});

  @override
  bool operator ==(Object other) => other is ReviewFinishResult && other.kept == kept && other.deleted == deleted;

  @override
  int get hashCode => Object.hash(kept, deleted);
}
