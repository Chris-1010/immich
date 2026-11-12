import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:hooks_riverpod/hooks_riverpod.dart';
import 'package:immich_mobile/domain/models/review.model.dart';
import 'package:immich_mobile/providers/review/review.provider.dart';
import 'package:immich_mobile/providers/review/review.state.dart';
import 'package:immich_mobile/repositories/review_api.repository.dart';
import 'package:immich_mobile/utils/option.dart';
import 'package:mocktail/mocktail.dart';
import 'package:openapi/api.dart' show AssetResponseDto;

class _MockReviewApiRepository extends Mock implements ReviewApiRepository {}

class _FakeAsset extends Fake implements AssetResponseDto {}

ReviewItem item(String id, {PendingDecision decision = PendingDecision.undecided, ReviewEdits? edits}) => ReviewItem(
  assetId: id,
  decision: decision,
  edits: edits ?? ReviewEdits.empty,
  createdAt: DateTime(2026),
  updatedAt: DateTime(2026),
);

void main() {
  late _MockReviewApiRepository repository;
  late ProviderContainer container;
  late ProviderSubscription<ReviewState> subscription;

  ReviewState read() => container.read(reviewProvider);
  ReviewNotifier notifier() => container.read(reviewProvider.notifier);

  Future<void> start(List<ReviewItem> items) async {
    when(() => repository.getItems()).thenAnswer((_) async => items);
    container = ProviderContainer(overrides: [reviewApiRepositoryProvider.overrideWithValue(repository)]);
    addTearDown(container.dispose);
    // Keep the auto-dispose provider alive for the whole test.
    subscription = container.listen(reviewProvider, (_, __) {});
    addTearDown(subscription.close);
    await pumpEventQueue();
  }

  setUpAll(() {
    registerFallbackValue(ReviewEdits.empty);
    registerFallbackValue(PendingDecision.undecided);
  });

  setUp(() {
    repository = _MockReviewApiRepository();
    when(() => repository.getAssetInfo(any())).thenAnswer((_) async => _FakeAsset());
    when(() => repository.getSimilar(any())).thenAnswer((_) async => const []);
    when(() => repository.update(any(), decision: any(named: 'decision'))).thenAnswer(
      (invocation) async => item(
        invocation.positionalArguments.first as String,
        decision: invocation.namedArguments[#decision] as PendingDecision,
      ),
    );
  });

  test('loads the pending list and starts at the first undecided item', () async {
    await start([item('a', decision: PendingDecision.keep), item('b'), item('c')]);

    expect(read().isLoading, isFalse);
    expect(read().total, 3);
    expect(read().current?.assetId, 'b');
  });

  group('decisions', () {
    test('decide saves the decision and advances', () async {
      await start([item('a'), item('b')]);

      await notifier().decide(PendingDecision.keep);

      verify(() => repository.update('a', decision: PendingDecision.keep)).called(1);
      expect(read().items[0].decision, PendingDecision.keep);
      expect(read().current?.assetId, 'b');
      expect(read().canUndo, isTrue);
    });

    test('a failed save rolls the decision back and reports the error', () async {
      await start([item('a'), item('b')]);
      when(() => repository.update('a', decision: any(named: 'decision'))).thenThrow(Exception('offline'));

      await notifier().decide(PendingDecision.delete);

      expect(read().items[0].decision, PendingDecision.undecided);
      expect(read().history, isEmpty);
      expect(read().error?.kind, ReviewErrorKind.decide);
    });

    test('the decision is shown before the save completes', () async {
      await start([item('a'), item('b')]);
      final completer = Completer<ReviewItem>();
      when(() => repository.update('a', decision: any(named: 'decision'))).thenAnswer((_) => completer.future);

      final pending = notifier().decide(PendingDecision.keep);
      expect(read().items[0].decision, PendingDecision.keep);
      expect(read().current?.assetId, 'b');

      completer.complete(item('a', decision: PendingDecision.keep));
      await pending;
    });

    test('undo of a decision restores it on the server and returns to it', () async {
      await start([item('a'), item('b')]);
      await notifier().decide(PendingDecision.keep);

      await notifier().undo();

      verify(() => repository.update('a', decision: PendingDecision.undecided)).called(1);
      expect(read().items[0].decision, PendingDecision.undecided);
      expect(read().current?.assetId, 'a');
      expect(read().canUndo, isFalse);
    });

    test('a failed undo puts the decision and the undo entry back', () async {
      await start([item('a'), item('b')]);
      await notifier().decide(PendingDecision.keep);
      when(() => repository.update('a', decision: PendingDecision.undecided)).thenThrow(Exception('offline'));

      await notifier().undo();

      expect(read().items[0].decision, PendingDecision.keep);
      expect(read().canUndo, isTrue);
      expect(read().error?.kind, ReviewErrorKind.decide);
    });

    test('skip and its undo touch nothing on the server', () async {
      await start([item('a'), item('b')]);

      notifier().skip();
      expect(read().current?.assetId, 'b');
      await notifier().undo();
      expect(read().current?.assetId, 'a');

      verifyNever(() => repository.update(any(), decision: any(named: 'decision')));
    });
  });

  group('staged edits', () {
    const face = ReviewFaceEdit(faceId: 'face-1', personId: 'person-1');
    final staged = const ReviewEdits(description: 'Old', albumIds: ['album-1'], faces: [face]);

    test('merge into the existing edits and send the full set', () async {
      await start([item('a', edits: staged)]);
      when(
        () => repository.update('a', edits: any(named: 'edits')),
      ).thenAnswer((invocation) async => item('a', edits: invocation.namedArguments[#edits] as ReviewEdits));

      await notifier().stageEdits('a', const ReviewEditsPatch(rating: Option.some(5)));

      final sent = verify(() => repository.update('a', edits: captureAny(named: 'edits'))).captured.single;
      expect(sent, const ReviewEdits(description: 'Old', rating: 5, albumIds: ['album-1'], faces: [face]));
      expect(read().items.single.edits.rating, 5);
    });

    test('a failed save restores the previous edits', () async {
      await start([item('a', edits: staged)]);
      when(() => repository.update('a', edits: any(named: 'edits'))).thenThrow(Exception('offline'));

      await notifier().stageEdits('a', const ReviewEditsPatch(description: Option.some('New')));

      expect(read().items.single.edits, staged);
      expect(read().error?.kind, ReviewErrorKind.edit);
    });

    test('a patch that changes nothing is not sent', () async {
      await start([item('a', edits: staged)]);

      await notifier().stageEdits('a', const ReviewEditsPatch(description: Option.some('Old')));

      verifyNever(() => repository.update(any(), edits: any(named: 'edits')));
    });
  });

  group('per-visit caches', () {
    test('look-alikes are asked for once per asset, and failures are swallowed', () async {
      when(() => repository.getSimilar('a')).thenThrow(Exception('not indexed'));
      await start([item('a'), item('b')]);

      notifier().jumpTo(1);
      notifier().jumpTo(0);
      await notifier().loadSimilar('a');
      await pumpEventQueue();

      verify(() => repository.getSimilar('a')).called(1);
      verify(() => repository.getSimilar('b')).called(1);
      expect(read().error, isNull);
    });

    test('asset details are fetched once and cached', () async {
      await start([item('a')]);

      final first = await notifier().loadAsset('a');
      final second = await notifier().loadAsset('a');

      expect(first, same(second));
      expect(read().assets['a'], same(first));
      verify(() => repository.getAssetInfo('a')).called(1);
    });
  });

  group('finish', () {
    test('clears the list, then the caches, and returns the result', () async {
      await start([item('a', decision: PendingDecision.keep), item('b', decision: PendingDecision.delete)]);
      when(() => repository.finish()).thenAnswer((_) async => const ReviewFinishResult(kept: 1, deleted: 1));
      final seen = <ReviewState>[];
      container.listen(reviewProvider, (_, next) => seen.add(next));

      final result = await notifier().finish();

      expect(result, const ReviewFinishResult(kept: 1, deleted: 1));
      expect(read().items, isEmpty);
      expect(read().assets, isEmpty);
      expect(read().similar, isEmpty);
      expect(read().isFinishing, isFalse);
      // The list empties while the caches are still in place.
      final cleared = seen.firstWhere((state) => state.items.isEmpty);
      expect(cleared.assets, isNotEmpty);
    });

    test('a failure reloads the list and reports the error', () async {
      await start([item('a', decision: PendingDecision.keep)]);
      when(() => repository.finish()).thenThrow(Exception('400'));
      when(() => repository.getItems()).thenAnswer((_) async => [item('a', decision: PendingDecision.keep), item('z')]);

      final result = await notifier().finish();

      expect(result, isNull);
      expect(read().total, 2);
      expect(read().isFinishing, isFalse);
      expect(read().error?.kind, ReviewErrorKind.finish);
    });
  });
}
