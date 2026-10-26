import { PersonDetailDatePrecision, type PersonDetailResponseDto } from '@immich/sdk';
import { DateTime } from 'luxon';
import type { Translations } from 'svelte-i18n';

type Dated = Pick<PersonDetailResponseDto, 'createdAt' | 'since' | 'sincePrecision' | 'until' | 'untilPrecision'>;

/** An i18n key and the values it is filled with, left to the caller to translate. */
export type DetailSubtitle = { key: Translations; values: Record<string, string> };

/**
 * A Since or Until date as precise as it was recorded and no more: "2019" for a year, "Mar 2019"
 * for a month. A day is never shown, since the server snaps every date to the first of its month
 * or year, and "1 Mar 2019" would claim a precision nobody gave it.
 *
 * A missing precision reads as a month, which is what the server assumes when given none.
 */
export const formatDetailDate = (
  date: string,
  precision: PersonDetailDatePrecision | null | undefined,
  locale: string | undefined,
) =>
  DateTime.fromISO(date).toLocaleString(
    precision === PersonDetailDatePrecision.Year ? { year: 'numeric' } : { month: 'short', year: 'numeric' },
    { locale },
  );

/** A detail is Current while it has no end date, and Past once it has one. */
export const isCurrentDetail = (detail: Pick<PersonDetailResponseDto, 'until'>) => detail.until === null;

/**
 * The muted line under a detail, saying when the fact held.
 *
 * Current: "Since Mar 2019" when that is known, otherwise "As of Oct 2026" from when it was added,
 * which is the one date that always exists. Past: "Mar 2019 – Oct 2026", or "Until Oct 2026" when
 * the start was never recorded.
 */
export const getDetailSubtitle = (detail: Dated, locale: string | undefined): DetailSubtitle => {
  const since = detail.since ? formatDetailDate(detail.since, detail.sincePrecision, locale) : undefined;

  if (detail.until === null) {
    return since
      ? { key: 'detail_since', values: { date: since } }
      : {
          key: 'detail_as_of',
          values: { date: formatDetailDate(detail.createdAt, PersonDetailDatePrecision.Month, locale) },
        };
  }

  const until = formatDetailDate(detail.until, detail.untilPrecision, locale);

  return since ? { key: 'detail_range', values: { since, until } } : { key: 'detail_until', values: { date: until } };
};

/**
 * The Past list, most recently ended first. Rows ending in the same month keep their manual order,
 * which a stable sort leaves alone for ties. The filter has already
 * made a copy, so the caller's array is not reordered.
 */
export const sortPastDetails = <T extends Pick<PersonDetailResponseDto, 'until'>>(details: T[]) =>
  details.filter((detail) => detail.until !== null).sort((a, b) => (b.until ?? '').localeCompare(a.until ?? ''));
