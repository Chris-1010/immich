import { formatDetailDate, getDetailSubtitle, sortPastDetails } from '$lib/utils/person-detail-dates';
import { PersonDetailDatePrecision } from '@immich/sdk';

const dated = (overrides: Partial<Parameters<typeof getDetailSubtitle>[0]> = {}) => ({
  createdAt: '2026-10-03T12:00:00.000Z',
  since: null,
  sincePrecision: null,
  until: null,
  untilPrecision: null,
  ...overrides,
});

describe('formatDetailDate', () => {
  it('shows a month and year at month precision, never a day', () => {
    expect(formatDetailDate('2019-03-01', PersonDetailDatePrecision.Month, 'en')).toBe('Mar 2019');
  });

  it('shows only the year at year precision', () => {
    expect(formatDetailDate('2019-01-01', PersonDetailDatePrecision.Year, 'en')).toBe('2019');
  });

  it('reads a missing precision as a month', () => {
    expect(formatDetailDate('2019-03-01', null, 'en')).toBe('Mar 2019');
  });
});

describe('getDetailSubtitle', () => {
  it('says since when for a current detail with a start', () => {
    expect(
      getDetailSubtitle(dated({ since: '2019-03-01', sincePrecision: PersonDetailDatePrecision.Month }), 'en'),
    ).toEqual({ key: 'detail_since', values: { date: 'Mar 2019' } });
  });

  it('falls back to when it was added for a current detail without a start', () => {
    expect(getDetailSubtitle(dated(), 'en')).toEqual({ key: 'detail_as_of', values: { date: 'Oct 2026' } });
  });

  it('gives a range for a past detail with both ends', () => {
    expect(
      getDetailSubtitle(
        dated({
          since: '2019-01-01',
          sincePrecision: PersonDetailDatePrecision.Year,
          until: '2026-10-01',
          untilPrecision: PersonDetailDatePrecision.Month,
        }),
        'en',
      ),
    ).toEqual({ key: 'detail_range', values: { since: '2019', until: 'Oct 2026' } });
  });

  it('says until when for a past detail without a start', () => {
    expect(
      getDetailSubtitle(dated({ until: '2026-10-01', untilPrecision: PersonDetailDatePrecision.Month }), 'en'),
    ).toEqual({ key: 'detail_until', values: { date: 'Oct 2026' } });
  });
});

describe('sortPastDetails', () => {
  it('keeps only past details, most recently ended first, without touching the input', () => {
    const details = [
      { id: 'a', until: '2020-01-01' },
      { id: 'b', until: null },
      { id: 'c', until: '2024-06-01' },
      { id: 'd', until: '2020-01-01' },
    ];

    expect(sortPastDetails(details).map(({ id }) => id)).toEqual(['c', 'a', 'd']);
    expect(details.map(({ id }) => id)).toEqual(['a', 'b', 'c', 'd']);
  });
});
