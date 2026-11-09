import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/widgets/common/date_time_picker.dart';

void main() {
  group('formatDayFirstDate', () {
    test('adds a slash after the day and month', () {
      expect(formatDayFirstDate('1'), '1');
      expect(formatDayFirstDate('12'), '12/');
      expect(formatDayFirstDate('12/0'), '12/0');
      expect(formatDayFirstDate('12/03'), '12/03/');
      expect(formatDayFirstDate('12/03/2024'), '12/03/2024');
    });

    test('lays out digits typed without slashes', () {
      expect(formatDayFirstDate('12032024'), '12/03/2024');
    });

    test('ignores a slash typed straight after an inserted one', () {
      expect(formatDayFirstDate('12//'), '12/');
    });

    test('pads a single digit followed by a slash', () {
      expect(formatDayFirstDate('1/'), '01/');
      expect(formatDayFirstDate('01/3/'), '01/03/');
    });

    test('stops the year at four digits', () {
      expect(formatDayFirstDate('12/03/20245'), '12/03/2024');
    });

    test('drops other characters', () {
      expect(formatDayFirstDate('12-03-2024'), '12/03/2024');
    });
  });
}
