import { orderBlankPersonPlaces } from '$lib/utils/location-suggestions';
import { LocationSearchResultType, PersonDetailKind, type PersonPlaceResponseDto } from '@immich/sdk';

const place = (detailId: string, personId: string, isCurrent = true): PersonPlaceResponseDto => ({
  detailId,
  personId,
  isCurrent,
  key: 'home',
  kind: PersonDetailKind.Home,
  latitude: 1,
  longitude: 2,
  personIsHidden: false,
  personName: personId,
  personUpdatedAt: '2026-01-01T00:00:00.000Z',
  since: null,
  sincePrecision: null,
  until: null,
  untilPrecision: null,
  value: `${personId}'s place`,
});

const row = (person: PersonPlaceResponseDto) => ({ type: LocationSearchResultType.Person, person });
const ids = (rows: { person?: PersonPlaceResponseDto }[]) => rows.map((r) => r.person?.detailId);

describe('orderBlankPersonPlaces', () => {
  const ann = place('ann-home', 'ann');
  const bob = place('bob-home', 'bob');
  const cat = place('cat-home', 'cat');
  const rows = [row(ann), row(bob), row(cat), { type: LocationSearchResultType.Saved }];

  it('lists only the places of people in the asset when there are no recents', () => {
    expect(ids(orderBlankPersonPlaces(rows, new Set(['cat']), []))).toEqual(['cat-home']);
  });

  it('puts the people in the asset first, then recents not already listed', () => {
    expect(ids(orderBlankPersonPlaces(rows, new Set(['cat']), [cat, ann]))).toEqual(['cat-home', 'ann-home']);
  });

  it('shows a recent place as the server now has it', () => {
    const moved = { ...bob, value: 'old value' };
    const [result] = orderBlankPersonPlaces(rows, new Set(), [moved]);
    expect(result.person?.value).toBe(bob.value);
  });

  it('drops a recent current place the server no longer lists but keeps a former one', () => {
    const gone = place('gone-home', 'dan');
    const former = place('eve-old', 'eve', false);
    expect(ids(orderBlankPersonPlaces(rows, new Set(), [gone, former]))).toEqual(['eve-old']);
  });
});
