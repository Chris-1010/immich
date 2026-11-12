import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:immich_mobile/repositories/api.repository.dart';
import 'package:openapi/api.dart';

final reviewApiRepositoryProvider = Provider((ref) {
  final apiService = ref.watch(apiServiceProvider);
  return ReviewApiRepository(ReviewApi(apiService.apiClient), apiService.assetsApi);
});

/// Client for this fork's `/review` endpoints (pending assets awaiting a Keep or Delete decision),
/// plus the asset details read the review screen needs. Pending assets never reach the local
/// database, so everything here comes straight from the server.
class ReviewApiRepository extends ApiRepository {
  final ReviewApi _api;
  final AssetsApi _assetsApi;

  ReviewApiRepository(this._api, this._assetsApi);

  /// Every pending asset, in upload order.
  Future<List<ReviewItem>> getItems() async {
    final dtos = await checkNull(_api.getReviewItems());
    return dtos.map(_toItem).toList(growable: false);
  }

  /// Set the decision and/or replace all staged edits. Returns the item as the server now holds it.
  Future<ReviewItem> update(String assetId, {PendingDecision? decision, ReviewEdits? edits}) async {
    final dto = await checkNull(
      _api.updateReviewItem(
        assetId,
        ReviewUpdateDto(
          decision: decision == null ? null : _toDecisionDto(decision),
          edits: edits == null ? null : _toEditsDto(edits),
        ),
      ),
    );
    return _toItem(dto);
  }

  /// Library look-alikes, closest first.
  Future<List<ReviewSimilarAsset>> getSimilar(String assetId) async {
    final dtos = await checkNull(_api.getReviewSimilar(assetId));
    return dtos.map((dto) => ReviewSimilarAsset(assetId: dto.assetId, distance: dto.distance)).toList(growable: false);
  }

  /// Commit every decision. Fails while anything is undecided or nothing is pending.
  Future<ReviewFinishResult> finish() async {
    final dto = await checkNull(_api.finishReview());
    return ReviewFinishResult(kept: dto.kept, deleted: dto.deleted);
  }

  /// Full details (EXIF, type, duration) of a pending asset, as the server holds it before any
  /// staged edits are applied.
  Future<AssetResponseDto> getAssetInfo(String assetId) => checkNull(_assetsApi.getAssetInfo(assetId));

  static ReviewItem _toItem(ReviewItemResponseDto dto) => ReviewItem(
    assetId: dto.assetId,
    decision: _fromDecisionDto(dto.decision),
    edits: _fromEditsDto(dto.edits),
    createdAt: dto.createdAt,
    updatedAt: dto.updatedAt,
  );

  static PendingDecision _fromDecisionDto(ReviewDecision decision) => switch (decision) {
    ReviewDecision.keep => PendingDecision.keep,
    ReviewDecision.delete => PendingDecision.delete,
    _ => PendingDecision.undecided,
  };

  static ReviewDecision _toDecisionDto(PendingDecision decision) => switch (decision) {
    PendingDecision.undecided => ReviewDecision.undecided,
    PendingDecision.keep => ReviewDecision.keep,
    PendingDecision.delete => ReviewDecision.delete,
  };

  static ReviewEdits _fromEditsDto(ReviewEditsDto dto) => ReviewEdits(
    description: dto.description,
    dateTimeOriginal: dto.dateTimeOriginal,
    latitude: dto.latitude,
    longitude: dto.longitude,
    noLocation: dto.noLocation,
    rating: dto.rating?.toInt(),
    isFavorite: dto.isFavorite,
    albumIds: List.unmodifiable(dto.albumIds),
    faces: List.unmodifiable(dto.faces.map((face) => ReviewFaceEdit(faceId: face.faceId, personId: face.personId))),
  );

  static ReviewEditsDto _toEditsDto(ReviewEdits edits) => ReviewEditsDto(
    description: edits.description,
    dateTimeOriginal: edits.dateTimeOriginal,
    latitude: edits.latitude,
    longitude: edits.longitude,
    noLocation: edits.noLocation,
    rating: edits.rating,
    isFavorite: edits.isFavorite,
    albumIds: [...edits.albumIds],
    faces: [for (final face in edits.faces) ReviewFaceEditDto(faceId: face.faceId, personId: face.personId)],
  );
}
