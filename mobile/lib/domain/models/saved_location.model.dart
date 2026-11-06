import 'package:maplibre_gl/maplibre_gl.dart';

/// A named point the user saved on the server so it can be picked again without searching.
class SavedLocation {
  final String id;
  final String name;
  final double latitude;
  final double longitude;

  const SavedLocation({required this.id, required this.name, required this.latitude, required this.longitude});

  LatLng get latLng => LatLng(latitude, longitude);

  factory SavedLocation.fromJson(Map<String, dynamic> json) => SavedLocation(
    id: json['id'] as String,
    name: json['name'] as String,
    latitude: (json['latitude'] as num).toDouble(),
    longitude: (json['longitude'] as num).toDouble(),
  );
}

/// A pinned Home or Work detail on a person, offered as a place to pick.
class PersonPlace {
  final String detailId;
  final String personId;
  final String personName;
  final String kind;

  /// The kind's name as the owner saved it, such as "Home".
  final String key;

  /// The text of the detail, such as "Rathmines" or a street address.
  final String value;
  final double latitude;
  final double longitude;
  final String? since;
  final String? until;
  final bool isCurrent;

  const PersonPlace({
    required this.detailId,
    required this.personId,
    required this.personName,
    required this.kind,
    required this.key,
    required this.value,
    required this.latitude,
    required this.longitude,
    required this.since,
    required this.until,
    required this.isCurrent,
  });

  LatLng get latLng => LatLng(latitude, longitude);

  factory PersonPlace.fromJson(Map<String, dynamic> json) => PersonPlace(
    detailId: json['detailId'] as String,
    personId: json['personId'] as String,
    personName: (json['personName'] as String?) ?? '',
    kind: (json['kind'] as String?) ?? '',
    key: (json['key'] as String?) ?? '',
    value: (json['value'] as String?) ?? '',
    latitude: (json['latitude'] as num).toDouble(),
    longitude: (json['longitude'] as num).toDouble(),
    since: json['since'] as String?,
    until: json['until'] as String?,
    isCurrent: (json['isCurrent'] as bool?) ?? true,
  );
}

/// A map place from the server's place search (Google behind the proxy, GeoNames otherwise).
class PlaceResult {
  final String name;
  final double latitude;
  final double longitude;
  final String? admin1Name;
  final String? admin2Name;

  const PlaceResult({
    required this.name,
    required this.latitude,
    required this.longitude,
    this.admin1Name,
    this.admin2Name,
  });

  LatLng get latLng => LatLng(latitude, longitude);

  /// The region line shown under the name, such as "Dublin City, County Dublin".
  String get region => [admin2Name, admin1Name].whereType<String>().where((s) => s.isNotEmpty).join(', ');

  factory PlaceResult.fromJson(Map<String, dynamic> json) => PlaceResult(
    name: (json['name'] as String?) ?? '',
    latitude: (json['latitude'] as num).toDouble(),
    longitude: (json['longitude'] as num).toDouble(),
    admin1Name: json['admin1name'] as String?,
    admin2Name: json['admin2name'] as String?,
  );
}

/// One row of the picker's combined search. Exactly one of the three payloads is set.
sealed class LocationSearchResult {
  const LocationSearchResult();

  LatLng get latLng;

  /// The name to label the pick with, such as a saved location's name.
  String get label;

  static LocationSearchResult? fromJson(Map<String, dynamic> json) {
    switch (json['type']) {
      case 'saved':
        final saved = json['saved'];
        return saved is Map<String, dynamic> ? SavedLocationResult(SavedLocation.fromJson(saved)) : null;
      case 'person':
        final person = json['person'];
        return person is Map<String, dynamic> ? PersonPlaceResult(PersonPlace.fromJson(person)) : null;
      case 'place':
        final place = json['place'];
        return place is Map<String, dynamic> ? MapPlaceResult(PlaceResult.fromJson(place)) : null;
      default:
        return null;
    }
  }
}

class SavedLocationResult extends LocationSearchResult {
  final SavedLocation location;

  const SavedLocationResult(this.location);

  @override
  LatLng get latLng => location.latLng;

  @override
  String get label => location.name;
}

class PersonPlaceResult extends LocationSearchResult {
  final PersonPlace place;

  const PersonPlaceResult(this.place);

  @override
  LatLng get latLng => place.latLng;

  @override
  String get label => place.value;
}

class MapPlaceResult extends LocationSearchResult {
  final PlaceResult place;

  const MapPlaceResult(this.place);

  @override
  LatLng get latLng => place.latLng;

  @override
  String get label => place.name;
}
