//
// AUTO-GENERATED FILE, DO NOT MODIFY!
//
// @dart=2.18

// ignore_for_file: unused_element, unused_import
// ignore_for_file: always_put_required_named_parameters_first
// ignore_for_file: constant_identifier_names
// ignore_for_file: lines_longer_than_80_chars

part of openapi.api;


class ReviewApi {
  ReviewApi([ApiClient? apiClient]) : apiClient = apiClient ?? defaultApiClient;

  final ApiClient apiClient;

  /// Finish the review
  ///
  /// Commit every decision in one step. Kept assets have their staged edits applied and join the library; assets decided Delete are permanently deleted. Refused while any pending asset is undecided.
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> finishReviewWithHttpInfo() async {
    // ignore: prefer_const_declarations
    final apiPath = r'/review/finish';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'POST',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Finish the review
  ///
  /// Commit every decision in one step. Kept assets have their staged edits applied and join the library; assets decided Delete are permanently deleted. Refused while any pending asset is undecided.
  Future<ReviewFinishResponseDto?> finishReview() async {
    final response = await finishReviewWithHttpInfo();
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'ReviewFinishResponseDto',) as ReviewFinishResponseDto;
    
    }
    return null;
  }

  /// List pending assets
  ///
  /// Retrieve every asset pending review for the authenticated user, in the order they were added, with each decision and its staged edits. Pending assets are added by uploading with `visibility` set to `review`.
  ///
  /// Note: This method returns the HTTP [Response].
  Future<Response> getReviewItemsWithHttpInfo() async {
    // ignore: prefer_const_declarations
    final apiPath = r'/review';

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// List pending assets
  ///
  /// Retrieve every asset pending review for the authenticated user, in the order they were added, with each decision and its staged edits. Pending assets are added by uploading with `visibility` set to `review`.
  Future<List<ReviewItemResponseDto>?> getReviewItems() async {
    final response = await getReviewItemsWithHttpInfo();
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<ReviewItemResponseDto>') as List)
        .cast<ReviewItemResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// Find look-alikes in the library
  ///
  /// Library assets that look like the pending asset, closest first, using the duplicate-detection embedding. Empty until smart search has processed the asset, or when duplicate detection is disabled.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<Response> getReviewSimilarWithHttpInfo(String id,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/review/{id}/similar'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>[];


    return apiClient.invokeAPI(
      apiPath,
      'GET',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Find look-alikes in the library
  ///
  /// Library assets that look like the pending asset, closest first, using the duplicate-detection embedding. Empty until smart search has processed the asset, or when duplicate detection is disabled.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  Future<List<ReviewSimilarAssetResponseDto>?> getReviewSimilar(String id,) async {
    final response = await getReviewSimilarWithHttpInfo(id,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      final responseBody = await _decodeBodyBytes(response);
      return (await apiClient.deserializeAsync(responseBody, 'List<ReviewSimilarAssetResponseDto>') as List)
        .cast<ReviewSimilarAssetResponseDto>()
        .toList(growable: false);

    }
    return null;
  }

  /// Update a pending asset
  ///
  /// Set the decision (undecided, keep or delete) and/or replace the staged edits of a pending asset. Nothing is applied to the asset until the review is finished.
  ///
  /// Note: This method returns the HTTP [Response].
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [ReviewUpdateDto] reviewUpdateDto (required):
  Future<Response> updateReviewItemWithHttpInfo(String id, ReviewUpdateDto reviewUpdateDto,) async {
    // ignore: prefer_const_declarations
    final apiPath = r'/review/{id}'
      .replaceAll('{id}', id);

    // ignore: prefer_final_locals
    Object? postBody = reviewUpdateDto;

    final queryParams = <QueryParam>[];
    final headerParams = <String, String>{};
    final formParams = <String, String>{};

    const contentTypes = <String>['application/json'];


    return apiClient.invokeAPI(
      apiPath,
      'PUT',
      queryParams,
      postBody,
      headerParams,
      formParams,
      contentTypes.isEmpty ? null : contentTypes.first,
    );
  }

  /// Update a pending asset
  ///
  /// Set the decision (undecided, keep or delete) and/or replace the staged edits of a pending asset. Nothing is applied to the asset until the review is finished.
  ///
  /// Parameters:
  ///
  /// * [String] id (required):
  ///
  /// * [ReviewUpdateDto] reviewUpdateDto (required):
  Future<ReviewItemResponseDto?> updateReviewItem(String id, ReviewUpdateDto reviewUpdateDto,) async {
    final response = await updateReviewItemWithHttpInfo(id, reviewUpdateDto,);
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, await _decodeBodyBytes(response));
    }
    // When a remote server returns no body with a status of 204, we shall not decode it.
    // At the time of writing this, `dart:convert` will throw an "Unexpected end of input"
    // FormatException when trying to decode an empty string.
    if (response.body.isNotEmpty && response.statusCode != HttpStatus.noContent) {
      return await apiClient.deserializeAsync(await _decodeBodyBytes(response), 'ReviewItemResponseDto',) as ReviewItemResponseDto;
    
    }
    return null;
  }
}
