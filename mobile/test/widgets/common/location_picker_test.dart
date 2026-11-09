import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/saved_location.model.dart';
import 'package:immich_mobile/widgets/common/location_picker.dart';

PersonPlace _place(String detailId, String personId, {bool isCurrent = true, String value = ''}) => PersonPlace(
  detailId: detailId,
  personId: personId,
  personName: personId,
  kind: 'home',
  key: 'Home',
  value: value,
  latitude: 53,
  longitude: -6,
  since: null,
  until: null,
  isCurrent: isCurrent,
);

List<String> _ids(List<LocationSearchResult> rows) => rows
    .map(
      (row) => switch (row) {
        SavedLocationResult(:final location) => location.id,
        PersonPlaceResult(:final place) => place.detailId,
        MapPlaceResult(:final place) => place.name,
      },
    )
    .toList();

void main() {
  const saved = SavedLocationResult(SavedLocation(id: 'saved', name: 'Work', latitude: 53, longitude: -6));
  final rows = <LocationSearchResult>[
    saved,
    PersonPlaceResult(_place('a1', 'anna')),
    PersonPlaceResult(_place('b1', 'ben')),
    PersonPlaceResult(_place('c1', 'cara')),
    PersonPlaceResult(_place('d1', 'dan')),
  ];

  group('orderBlankSearch', () {
    test('lists saved locations, detected people, then recents, and nothing else', () {
      final ordered = orderBlankSearch(rows, {'cara'}, [_place('b1', 'ben')]);
      expect(_ids(ordered), ['saved', 'c1', 'b1']);
    });

    test('does not repeat a recent place already listed for a detected person', () {
      final ordered = orderBlankSearch(rows, {'ben'}, [_place('b1', 'ben'), _place('a1', 'anna')]);
      expect(_ids(ordered), ['saved', 'b1', 'a1']);
    });

    test('shows a recent place as the server now has it', () {
      final ordered = orderBlankSearch(rows, {}, [_place('a1', 'anna', value: 'stale')]);
      expect((ordered[1] as PersonPlaceResult).place.value, '');
    });

    test('drops a recent current place the server no longer lists, keeps a former one', () {
      final ordered = orderBlankSearch(rows, {}, [_place('gone', 'eve'), _place('old', 'eve', isCurrent: false)]);
      expect(_ids(ordered), ['saved', 'old']);
    });

    test('keeps at most ten recents', () {
      final many = [for (var i = 0; i < 12; i++) PersonPlaceResult(_place('p$i', 'p$i'))];
      final ordered = orderBlankSearch([...many], {}, [for (final row in many) row.place]);
      expect(ordered.length, 10);
    });
  });
}
