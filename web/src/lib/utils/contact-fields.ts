import {
  PersonDetailDatePrecision,
  PersonDetailKind,
  reverseGeocode,
  type PersonDetailResponseDto,
  type PersonDetailUpsertDto,
} from '@immich/sdk';
import { DateTime } from 'luxon';
import type { Translations } from 'svelte-i18n';

/** The order the chips sit in after the birthday, which leads them all. */
export const CONTACT_KINDS = [
  PersonDetailKind.Work,
  PersonDetailKind.Home,
  PersonDetailKind.Email,
  PersonDetailKind.Phone,
] as const;

/** The kind's own name, which is also the key text a new row of that kind is saved under. */
export const contactFieldLabel: Record<PersonDetailKind, Translations> = {
  [PersonDetailKind.Work]: 'contact_field_work',
  [PersonDetailKind.Home]: 'contact_field_home',
  [PersonDetailKind.Email]: 'contact_field_email',
  [PersonDetailKind.Phone]: 'contact_field_phone',
};

/** "Add home" and the like, on the faded chip of a kind nothing is recorded under. */
export const contactFieldAddLabel: Record<PersonDetailKind, Translations> = {
  [PersonDetailKind.Work]: 'contact_field_add_work',
  [PersonDetailKind.Home]: 'contact_field_add_home',
  [PersonDetailKind.Email]: 'contact_field_add_email',
  [PersonDetailKind.Phone]: 'contact_field_add_phone',
};

/**
 * Email and Phone are shown as an icon alone: the value is long, unlike a place name, and is
 * wanted to be pasted somewhere far more often than read.
 */
export const isIconOnlyKind = (kind: PersonDetailKind) =>
  kind === PersonDetailKind.Email || kind === PersonDetailKind.Phone;

/** Only places can be pinned. The server refuses coordinates on any other kind. */
export const canPin = (kind: PersonDetailKind) => kind === PersonDetailKind.Home || kind === PersonDetailKind.Work;

/** A contact field has a chip of its own, which is what keeps it out of the free-text Current list. */
export const isContactField = (detail: Pick<PersonDetailResponseDto, 'kind'>) =>
  detail.kind !== null && detail.kind !== undefined;

/** Free-text details only. Contact fields are left out of every Current list in favour of their chip. */
export const isFreeTextDetail = (detail: Pick<PersonDetailResponseDto, 'kind'>) => !isContactField(detail);

/** The Current rows of one kind, in the order the person's list holds them. */
export const currentOfKind = <T extends Pick<PersonDetailResponseDto, 'kind' | 'until'>>(
  details: T[],
  kind: PersonDetailKind,
) => details.filter((detail) => detail.kind === kind && detail.until === null);

/**
 * The first of this month: what End and an archive stamp as Until, at month precision, the same
 * as the details modal does.
 */
export const thisMonth = () => DateTime.now().startOf('month').toISODate()!;

/**
 * A saved detail exactly as it came, ready to go back in a whole-list save.
 *
 * Every field the server knows about is carried, kind and pin included. The save replaces the
 * whole list, so anything left off here is not "unchanged" — it is wiped: a Past row sent without
 * `until` comes back Current, and a Home sent without `kind` comes back as a free-text detail.
 */
export const asUpsert = (detail: PersonDetailResponseDto): PersonDetailUpsertDto => ({
  id: detail.id,
  key: detail.key,
  value: detail.value,
  kind: detail.kind,
  latitude: detail.latitude,
  longitude: detail.longitude,
  since: detail.since,
  sincePrecision: detail.sincePrecision,
  until: detail.until,
  untilPrecision: detail.untilPrecision,
  subdetails: detail.subdetails.map(({ id, key, value }) => ({ id, key, value })),
});

/** The whole list with one detail ended this month, which moves it to Past with nothing in its place. */
export const asEndedPayload = (details: PersonDetailResponseDto[], id: string): PersonDetailUpsertDto[] =>
  details.map((detail) =>
    detail.id === id
      ? { ...asUpsert(detail), until: thisMonth(), untilPrecision: PersonDetailDatePrecision.Month }
      : asUpsert(detail),
  );

/** One line of the contact-field editor. `source` is the saved detail it opened on, absent on a new one. */
export type ContactFieldRow = {
  rowId: string;
  source?: PersonDetailResponseDto;
  value: string;
  since: string | null;
  sincePrecision: PersonDetailDatePrecision | null;
  until: string | null;
  untilPrecision: PersonDetailDatePrecision | null;
  latitude: number | null;
  longitude: number | null;
  /**
   * Whether a changed value moves the old one to Past rather than overwriting it. Ticked by
   * default, as in the details modal, since history is the thing that cannot be got back.
   */
  archive: boolean;
  /**
   * The looked-up address of a pin set in this sitting. A row cleared after its pin filled it in is
   * saved under this rather than dropped, so clearing a saved location's name falls back to the
   * address, the same as a pin dropped anywhere else.
   */
  pinAddress?: string;
};

/**
 * Where a pin was put, the name of whatever was picked to put it there, when there was one, and the
 * address the coordinates resolve to regardless of what was picked.
 */
export type ContactFieldPin = { latitude: number; longitude: number; name?: string; address?: string };

/**
 * What a new pin is called, for filling a blank value. The saved location or search result the
 * user picked says it best; failing that, the server's offline GeoNames lookup gives `City,
 * Country` (city-level at best, and nothing at sea). Reverse geocoding stays on the server so a
 * home's coordinates never reach an outside service. A failed lookup leaves the pin unnamed rather
 * than failing the pin.
 */
export const resolvePinName = async (latitude: number, longitude: number, pickedName?: string) => {
  if (pickedName?.trim()) {
    return pickedName.trim();
  }

  try {
    const [place] = await reverseGeocode({ lat: latitude, lon: longitude });
    const name = [place?.city, place?.country].filter(Boolean).join(', ');
    return name || undefined;
  } catch {
    return undefined;
  }
};

/**
 * A saved Current row whose value now says something else. Only then is keeping the old one
 * offered, and putting the value back the way it was withdraws the offer.
 */
export const changesValue = (row: ContactFieldRow) =>
  row.source !== undefined &&
  row.until === null &&
  row.value.trim() !== '' &&
  row.value.trim() !== row.source.value.trim();

/**
 * The editor's rows as details. A row whose value changed with "Move the old one to Past" ticked
 * goes out as two, with the same semantics as the details modal: a new Current row with the new
 * value, no `id`, no dates and no subdetails; and the old row under its own `id` and value, ended
 * this month, keeping its subdetails and its pin, since both described the old fact.
 *
 * The pin is the one thing a new row may inherit, and only when it was changed during this edit —
 * a pin set alongside the new value is for the new place; one left alone belongs to the old.
 */
const asKindDetails = (row: ContactFieldRow, kind: PersonDetailKind, key: string): PersonDetailUpsertDto[] => {
  const value = rowValue(row);
  const fields: PersonDetailUpsertDto = {
    id: row.source?.id,
    key: row.source?.key ?? key,
    value,
    kind,
    latitude: canPin(kind) ? row.latitude : null,
    longitude: canPin(kind) ? row.longitude : null,
    since: row.since,
    sincePrecision: row.sincePrecision,
    until: row.until,
    untilPrecision: row.untilPrecision,
    subdetails: (row.source?.subdetails ?? []).map(({ id, key, value }) => ({ id, key, value })),
  };

  if (!row.source || !changesValue(row) || !row.archive) {
    return [fields];
  }

  const source = row.source;
  const repinned = row.latitude !== source.latitude || row.longitude !== source.longitude;

  return [
    {
      ...fields,
      id: undefined,
      latitude: repinned ? fields.latitude : null,
      longitude: repinned ? fields.longitude : null,
      since: null,
      sincePrecision: null,
      until: null,
      untilPrecision: null,
      subdetails: [],
    },
    {
      ...fields,
      value: source.value,
      latitude: source.latitude,
      longitude: source.longitude,
      until: thisMonth(),
      untilPrecision: PersonDetailDatePrecision.Month,
    },
  ];
};

/**
 * What a row saves as: its text, or for a row left blank with a pin set in this sitting, the pin's
 * address. A blank row with neither is unfinished.
 */
const rowValue = (row: ContactFieldRow) => {
  const value = row.value.trim();
  if (value || row.latitude === null || row.longitude === null) {
    return value;
  }
  return row.pinAddress?.trim() ?? '';
};

/**
 * The person's whole list with one kind's Current rows swapped for what the editor holds.
 *
 * Everything else goes back exactly as it came, Past rows of the same kind included. The edited
 * rows take the place of the first Current row of the kind, so the list keeps its order; a kind
 * with nothing Current yet is added at the end. Rows left blank are dropped as unfinished, which
 * for a saved row is a delete — the same as clearing a row in the details modal.
 */
export const asContactFieldPayload = (
  details: PersonDetailResponseDto[],
  kind: PersonDetailKind,
  rows: ContactFieldRow[],
  key: string,
): PersonDetailUpsertDto[] => {
  const edited = rows.filter((row) => rowValue(row) !== '').flatMap((row) => asKindDetails(row, kind, key));

  const payload: PersonDetailUpsertDto[] = [];
  let placed = false;

  for (const detail of details) {
    if (detail.kind === kind && detail.until === null) {
      if (!placed) {
        payload.push(...edited);
        placed = true;
      }
      continue;
    }

    payload.push(asUpsert(detail));
  }

  if (!placed) {
    payload.push(...edited);
  }

  return payload;
};
