import 'dart:convert';
import 'dart:io' show HttpStatus;

import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/saved_location.model.dart';
import 'package:immich_mobile/providers/api.provider.dart';
import 'package:openapi/api.dart';

final savedLocationApiRepositoryProvider = Provider(
  (ref) => SavedLocationApiRepository(ref.watch(apiServiceProvider).apiClient),
);

/// Client for this fork's `/saved-locations` endpoints and the No Location asset flag.
///
/// The generated SDK is built from upstream and has neither, so these calls go through the raw
/// [ApiClient], which still applies the session's auth and custom headers.
class SavedLocationApiRepository {
  final ApiClient _client;

  const SavedLocationApiRepository(this._client);

  Future<dynamic> _send(String path, String method, {Object? body, List<QueryParam> query = const []}) async {
    final response = await _client.invokeAPI(
      path,
      method,
      [...query],
      body,
      {},
      {},
      body == null ? null : 'application/json',
    );
    if (response.statusCode >= HttpStatus.badRequest) {
      throw ApiException(response.statusCode, utf8.decode(response.bodyBytes));
    }
    if (response.bodyBytes.isEmpty) {
      return null;
    }
    return jsonDecode(utf8.decode(response.bodyBytes));
  }

  Future<List<SavedLocation>> getAll() async {
    final json = await _send('/saved-locations', 'GET');
    return (json as List).cast<Map<String, dynamic>>().map(SavedLocation.fromJson).toList();
  }

  Future<SavedLocation> create(String name, double latitude, double longitude) async {
    final json = await _send(
      '/saved-locations',
      'POST',
      body: {'name': name, 'latitude': latitude, 'longitude': longitude},
    );
    return SavedLocation.fromJson(json as Map<String, dynamic>);
  }

  Future<SavedLocation> rename(String id, String name) async {
    final json = await _send('/saved-locations/$id', 'PUT', body: {'name': name});
    return SavedLocation.fromJson(json as Map<String, dynamic>);
  }

  Future<void> delete(String id) => _send('/saved-locations/$id', 'DELETE');

  /// Saved locations, then people's places, then map places. A blank [query] returns only saved
  /// locations and current people's places.
  Future<List<LocationSearchResult>> search(String query) async {
    final trimmed = query.trim();
    final json = await _send(
      '/saved-locations/search',
      'GET',
      query: [if (trimmed.isNotEmpty) QueryParam('query', trimmed)],
    );
    return (json as List)
        .cast<Map<String, dynamic>>()
        .map(LocationSearchResult.fromJson)
        .whereType<LocationSearchResult>()
        .toList();
  }

  /// Whether the server has the asset marked No Location. The sync stream does not carry the flag,
  /// so it is read from the asset's details when needed.
  Future<bool> getNoLocation(String assetId) async {
    final json = await _send('/assets/$assetId', 'GET');
    final exif = (json as Map<String, dynamic>)['exifInfo'];
    return exif is Map<String, dynamic> && exif['noLocation'] == true;
  }

  /// Marks the assets No Location: the server clears their coordinates and locks them so a metadata
  /// re-scan cannot bring GPS back.
  Future<void> markNoLocation(List<String> assetIds) =>
      _send('/assets', 'PUT', body: {'ids': assetIds, 'noLocation': true});

  /// Clears the No Location marker on one asset and unlocks its coordinates.
  Future<void> unassignNoLocation(String assetId) => _send('/assets/$assetId', 'PUT', body: {'noLocation': false});
}
