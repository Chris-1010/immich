import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/utils/option.dart';

void main() {
  const face = ReviewFaceEdit(faceId: 'face-1', personId: 'person-1');
  const staged = ReviewEdits(
    description: 'Beach',
    rating: 4,
    latitude: 1.5,
    longitude: 2.5,
    albumIds: ['album-1', 'album-2'],
    faces: [face],
  );

  group('ReviewEdits.merge', () {
    test('keeps fields the patch does not mention, including albums and faces', () {
      final merged = staged.merge(const ReviewEditsPatch(description: Option.some('Sunset')));

      expect(merged.description, 'Sunset');
      expect(merged.rating, 4);
      expect(merged.latitude, 1.5);
      expect(merged.longitude, 2.5);
      expect(merged.albumIds, ['album-1', 'album-2']);
      expect(merged.faces, [face]);
    });

    test('clears a field when the patch says none', () {
      final merged = staged.merge(const ReviewEditsPatch(rating: Option.none()));

      expect(merged.rating, isNull);
      expect(merged.description, 'Beach');
    });

    test('an empty patch changes nothing', () {
      expect(staged.merge(const ReviewEditsPatch()), staged);
    });

    test('a picked point drops a staged no-location mark', () {
      const noLocation = ReviewEdits(noLocation: true, albumIds: ['album-1']);
      final merged = noLocation.merge(ReviewEditsPatch.location(10, 20));

      expect(merged.latitude, 10);
      expect(merged.longitude, 20);
      expect(merged.noLocation, isNull);
      expect(merged.albumIds, ['album-1']);
    });

    test('no location drops a staged point', () {
      final merged = staged.merge(const ReviewEditsPatch.noLocation());

      expect(merged.latitude, isNull);
      expect(merged.longitude, isNull);
      expect(merged.noLocation, isTrue);
      expect(merged.description, 'Beach');
    });

    test('clearing the location drops every location field and nothing else', () {
      final merged = staged.merge(const ReviewEditsPatch.clearLocation());

      expect(merged.hasLocation, isFalse);
      expect(merged.noLocation, isNull);
      expect(merged.rating, 4);
      expect(merged.faces, [face]);
    });

    test('a list in the patch replaces the staged list', () {
      final merged = staged.merge(const ReviewEditsPatch(albumIds: ['album-3']));

      expect(merged.albumIds, ['album-3']);
      expect(merged.faces, [face]);
    });
  });
}
