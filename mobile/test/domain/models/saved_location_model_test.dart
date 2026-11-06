import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/saved_location.model.dart';

void main() {
  group('LocationSearchResult.fromJson', () {
    test('reads each row by its type', () {
      final rows = [
        {
          'type': 'saved',
          'saved': {'id': 's1', 'name': 'Cabin', 'latitude': 1, 'longitude': 2.5},
        },
        {
          'type': 'person',
          'person': {
            'detailId': 'd1',
            'personId': 'p1',
            'personName': 'Ethan',
            'kind': 'home',
            'key': 'Home',
            'value': 'Rathmines',
            'latitude': 53.32,
            'longitude': -6.26,
            'since': '2015-01-01',
            'until': '2021-06-01',
            'isCurrent': false,
          },
        },
        {
          'type': 'place',
          'place': {'name': 'Dublin', 'latitude': 53.35, 'longitude': -6.26, 'admin1name': 'County Dublin'},
        },
      ].map(LocationSearchResult.fromJson).toList();

      final saved = rows[0] as SavedLocationResult;
      expect(saved.label, 'Cabin');
      expect(saved.latLng.longitude, 2.5);

      final person = rows[1] as PersonPlaceResult;
      expect(person.place.isCurrent, isFalse);
      expect(person.label, 'Rathmines');

      final place = rows[2] as MapPlaceResult;
      expect(place.place.region, 'County Dublin');
    });

    test('skips a row whose type is unknown or whose payload is missing', () {
      expect(LocationSearchResult.fromJson({'type': 'other'}), isNull);
      expect(LocationSearchResult.fromJson({'type': 'saved'}), isNull);
    });
  });
}
