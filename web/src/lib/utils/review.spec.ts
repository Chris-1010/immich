import { mergeEdits, nextIndex, withStagedEdits } from '$lib/utils/review';
import { ReviewDecision, type AssetResponseDto, type PersonResponseDto, type ReviewItemResponseDto } from '@immich/sdk';

const item = (assetId: string, decision = ReviewDecision.Undecided) =>
  ({ assetId, decision, edits: {}, createdAt: '', updatedAt: '' }) as ReviewItemResponseDto;

const asset = (overrides: Partial<AssetResponseDto> = {}) =>
  ({
    id: 'asset-1',
    isFavorite: false,
    exifInfo: {
      description: 'original',
      latitude: 10,
      longitude: 20,
      city: 'Paris',
      state: 'Ile-de-France',
      country: 'France',
    },
    people: [],
    unassignedFaces: [],
    ...overrides,
  }) as unknown as AssetResponseDto;

describe('nextIndex', () => {
  it('moves to the next undecided item', () => {
    const items = [item('a'), item('b', ReviewDecision.Keep), item('c')];
    expect(nextIndex(items, 0)).toBe(2);
  });

  it('wraps round to the start', () => {
    const items = [item('a'), item('b'), item('c', ReviewDecision.Delete)];
    expect(nextIndex(items, 1)).toBe(0);
  });

  it('skips decided items', () => {
    const items = [item('a'), item('b', ReviewDecision.Keep), item('c', ReviewDecision.Delete), item('d')];
    expect(nextIndex(items, 0)).toBe(3);
    expect(nextIndex(items, 3)).toBe(0);
  });

  it('falls back to the next item along when nothing else is undecided', () => {
    const items = [item('a', ReviewDecision.Keep), item('b', ReviewDecision.Keep), item('c', ReviewDecision.Keep)];
    expect(nextIndex(items, 0)).toBe(1);
    expect(nextIndex(items, 2)).toBe(2);
  });

  it('stays put with a single item and returns 0 for none', () => {
    expect(nextIndex([item('a')], 0)).toBe(0);
    expect(nextIndex([], 0)).toBe(0);
  });
});

describe('mergeEdits', () => {
  it('adds and overrides edits', () => {
    expect(mergeEdits({ description: 'a', rating: 2 }, { rating: 4 })).toEqual({ description: 'a', rating: 4 });
  });

  it('clears an edit whose patch value is undefined', () => {
    const merged = mergeEdits({ description: 'a', rating: 2 }, { description: undefined });
    expect(merged).toEqual({ rating: 2 });
    expect('description' in merged).toBe(false);
  });
});

describe('withStagedEdits', () => {
  it('returns the asset unchanged when nothing is staged', () => {
    const result = withStagedEdits(asset(), {}, {}, 'Pending');
    expect(result.exifInfo?.description).toBe('original');
    expect(result.exifInfo?.city).toBe('Paris');
  });

  it('applies a staged description', () => {
    const result = withStagedEdits(asset(), { description: 'new' }, {}, 'Pending');
    expect(result.exifInfo?.description).toBe('new');
  });

  it('applies staged coordinates with a placeholder place name', () => {
    const result = withStagedEdits(asset(), { latitude: 51.5, longitude: -0.12 }, {}, 'Pending');
    expect(result.exifInfo).toMatchObject({
      latitude: 51.5,
      longitude: -0.12,
      city: '51.50000, -0.12000',
      state: null,
      country: 'Pending',
      noLocation: false,
    });
  });

  it('clears the location when noLocation is staged', () => {
    const result = withStagedEdits(asset(), { noLocation: true, latitude: 1, longitude: 2 }, {}, 'Pending');
    expect(result.exifInfo).toMatchObject({
      latitude: null,
      longitude: null,
      city: null,
      state: null,
      country: null,
      noLocation: true,
    });
  });

  it('applies a staged dateTimeOriginal with its zone', () => {
    const result = withStagedEdits(asset(), { dateTimeOriginal: '2024-05-06T07:08:09.000+02:00' }, {}, 'Pending');
    expect(result.exifInfo?.dateTimeOriginal).toBe('2024-05-06T07:08:09.000+02:00');
    expect(result.exifInfo?.timeZone).toBe('UTC+2');
  });

  it('ignores an invalid dateTimeOriginal', () => {
    const result = withStagedEdits(asset(), { dateTimeOriginal: 'not a date' }, {}, 'Pending');
    expect(result.exifInfo?.dateTimeOriginal).toBeUndefined();
  });

  it('moves a staged face from unassigned onto a person', () => {
    const face = { id: 'face-1', boundingBoxX1: 0, boundingBoxY1: 0, boundingBoxX2: 1, boundingBoxY2: 1 };
    const other = { id: 'face-2', boundingBoxX1: 0, boundingBoxY1: 0, boundingBoxX2: 1, boundingBoxY2: 1 };
    const person = { id: 'person-1', name: 'Alice' } as PersonResponseDto;
    const source = asset({ unassignedFaces: [face, other] } as Partial<AssetResponseDto>);

    const result = withStagedEdits(source, {}, { 'face-1': person }, 'Pending');

    expect(result.unassignedFaces).toEqual([other]);
    expect(result.people).toEqual([{ ...person, faces: [face] }]);
    expect(source.unassignedFaces).toHaveLength(2);
  });
});
