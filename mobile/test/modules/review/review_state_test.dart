import 'package:flutter_test/flutter_test.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/providers/review/review.state.dart';

ReviewItem item(String id, [PendingDecision decision = PendingDecision.undecided]) =>
    ReviewItem(assetId: id, decision: decision, createdAt: DateTime(2026), updatedAt: DateTime(2026));

void main() {
  const keep = PendingDecision.keep;
  const delete = PendingDecision.delete;

  group('nextUndecidedIndex', () {
    test('finds the next undecided item after the current one', () {
      final items = [item('a'), item('b', keep), item('c')];
      expect(nextUndecidedIndex(items, 0), 2);
    });

    test('wraps round to the start', () {
      final items = [item('a'), item('b', keep), item('c', keep)];
      expect(nextUndecidedIndex(items, 1), 0);
    });

    test('moves one along when nothing else is undecided', () {
      final items = [item('a', keep), item('b', keep), item('c', delete)];
      expect(nextUndecidedIndex(items, 0), 1);
      expect(nextUndecidedIndex(items, 2), 2);
    });

    test('handles an empty list', () {
      expect(nextUndecidedIndex(const [], 0), 0);
    });
  });

  test('firstUndecidedIndex falls back to the first item', () {
    expect(firstUndecidedIndex([item('a', keep), item('b')]), 1);
    expect(firstUndecidedIndex([item('a', keep), item('b', delete)]), 0);
  });

  group('ReviewState', () {
    final start = ReviewState(items: [item('a'), item('b'), item('c')]);

    test('deciding marks the item, records it and advances', () {
      final next = start.decided(keep);

      expect(next.items[0].decision, keep);
      expect(next.index, 1);
      expect(next.history.single, isA<ReviewDecisionUndo>());
      expect(next.keepCount, 1);
      expect(next.decidedCount, 1);
      expect(next.undecidedCount, 2);
    });

    test('deciding the last undecided item wraps back to an earlier one', () {
      final state = ReviewState(items: [item('a'), item('b', keep), item('c')], index: 2);
      expect(state.decided(delete).index, 0);
    });

    test('skipping leaves the item undecided and advances', () {
      final next = start.skipped();

      expect(next.items[0].decision, PendingDecision.undecided);
      expect(next.index, 1);
      expect(next.history.single, isA<ReviewSkipUndo>());
    });

    test('undoing a decision restores it and returns to the item', () {
      final undone = start.decided(keep).decided(delete).undone();

      expect(undone.index, 1);
      expect(undone.items[1].decision, PendingDecision.undecided);
      expect(undone.items[0].decision, keep);
      expect(undone.history, hasLength(1));
    });

    test('undoing a decision that changed an earlier one restores the earlier one', () {
      final state = ReviewState(items: [item('a', keep), item('b')]);
      final undone = state.decided(delete).undone();

      expect(undone.items[0].decision, keep);
      expect(undone.index, 0);
    });

    test('undoing a skip returns to the skipped item', () {
      final undone = start.decided(keep).skipped().undone();

      expect(undone.index, 1);
      expect(undone.items[1].decision, PendingDecision.undecided);
      expect(undone.history.single, isA<ReviewDecisionUndo>());
    });

    test('undo with an empty history does nothing', () {
      expect(start.undone(), same(start));
    });

    test('undoing an entry whose asset left the list only drops the entry', () {
      final decided = start.decided(keep);
      final reloaded = decided.withItems([item('b'), item('c')]);
      final undone = reloaded.undone();

      expect(undone.history, isEmpty);
      expect(undone.index, reloaded.index);
    });

    test('jumping clamps to the list', () {
      expect(start.jumpedTo(2).index, 2);
      expect(start.jumpedTo(9).index, 2);
      expect(start.jumpedTo(-1).index, 0);
    });

    test('a fresh list keeps the current asset when it is still pending', () {
      final state = start.jumpedTo(2);
      final reloaded = state.withItems([item('c'), item('d')]);
      expect(reloaded.current?.assetId, 'c');
    });

    test('canFinish only once nothing is undecided', () {
      expect(start.canFinish, isFalse);
      expect(start.decided(keep).decided(keep).decided(delete).canFinish, isTrue);
      expect(const ReviewState().canFinish, isFalse);
    });
  });
}
