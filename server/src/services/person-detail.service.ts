import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  mapPersonDetail,
  PersonDetailConflictResponseDto,
  PersonDetailConflictSearchDto,
  PersonDetailNames,
  PersonDetailResponseDto,
  PersonDetailsBulkAddDto,
  PersonDetailSuggestionResponseDto,
  PersonDetailSuggestionSearchDto,
  PersonDetailsUpdateDto,
  PersonDetailValueSuggestionSearchDto,
  PersonDetailWithSubdetailsDto,
} from 'src/dtos/person-detail.dto';
import { Permission, PersonDetailDatePrecision, PersonDetailKind } from 'src/enum';
import {
  AlongWith,
  detailKeyToken,
  PersonDetail,
  PersonDetailKindFields,
} from 'src/repositories/person-detail.repository';
import { BaseService } from 'src/services/base.service';

/** How many suggestions a picker shows before the list stops being worth scrolling. */
const DEFAULT_SUGGESTION_LIMIT = 10;
const MAX_SUGGESTION_LIMIT = 50;

/** A key (or kind token) and value as they are compared: both ends trimmed and lowercased. */
const matchKey = (key: string, value: string) => `${key.trim().toLowerCase()} ${value.trim().toLowerCase()}`;

const asAlongWithMap = (groups: AlongWith[]) =>
  new Map(groups.map((group) => [matchKey(group.key, group.value), group]));

/** The subject's own keys and subdetails, for naming a shared one back to them in their own words. */
const asNames = (details: PersonDetail[]): PersonDetailNames => ({
  // Keyed by the same token along-with groups by, so a shared Home is named by the subject's own
  // label for their Home rather than by whatever the other person saved it under.
  keys: new Map(details.map((detail) => [detailKeyToken(detail), detail.key])),
  subdetails: new Map(
    details.flatMap((detail) =>
      detail.subdetails.map(
        (sub) =>
          [matchKey(sub.key, sub.value), { key: sub.key, value: sub.value }] as [
            string,
            { key: string; value: string },
          ],
      ),
    ),
  ),
});

/**
 * A Since or Until date snapped to the start of the period its precision names, so "2019" is stored
 * as 2019-01-01 and "Mar 2019" as 2019-03-01 whatever day the client happened to send. A date with
 * no precision is taken as a month, the finer of the two; a precision with no date means nothing
 * and is dropped.
 */
const asPeriod = (date?: string | null, precision?: PersonDetailDatePrecision | null) => {
  if (!date) {
    return { date: null, precision: null };
  }

  const [year, month] = date.split('-');
  const resolved = precision ?? PersonDetailDatePrecision.Month;
  return {
    date: resolved === PersonDetailDatePrecision.Year ? `${year}-01-01` : `${year}-${month}-01`,
    precision: resolved,
  };
};

/** The kinds that are places, and so the only ones a pin means anything on. */
const PINNABLE_KINDS = new Set<PersonDetailKind>([PersonDetailKind.Home, PersonDetailKind.Work]);

/**
 * A detail's kind and pin as they are stored, refusing a pin that cannot be right: half of one, or
 * one on an email address or phone number. The ranges are checked by the DTO; this is what a
 * single field cannot see. Subdetails need no check here — their type has no kind or pin to send.
 */
const asKindFields = (detail: PersonDetailWithSubdetailsDto): PersonDetailKindFields => {
  const kind = detail.kind ?? null;
  const latitude = detail.latitude ?? null;
  const longitude = detail.longitude ?? null;

  if ((latitude === null) !== (longitude === null)) {
    throw new BadRequestException('A pin needs both a latitude and a longitude');
  }

  if (latitude !== null && (!kind || !PINNABLE_KINDS.has(kind))) {
    throw new BadRequestException('Only a Home or Work detail can have a pin');
  }

  return { kind, latitude, longitude };
};

@Injectable()
export class PersonDetailService extends BaseService {
  async getDetails(auth: AuthDto, personId: string): Promise<PersonDetailResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.PersonDetailRead, ids: [personId] });

    const [details, alongWith] = await Promise.all([
      this.personDetailRepository.getForPerson(personId),
      this.personDetailRepository.getAlongWith(auth.user.id, personId),
    ]);

    const groups = asAlongWithMap(alongWith);
    const names = asNames(details);

    return details.map((detail) => mapPersonDetail(detail, groups, names));
  }

  /**
   * Replaces a person's whole list in one write. The modal edits the list as a whole, so it saves
   * it as a whole: what arrives is what the person ends up with, in that order.
   *
   * Rows blank at either end are dropped rather than rejected. An empty row is what an unfinished
   * "+ Add detail" leaves behind, and failing a save because of one is a worse answer than
   * quietly not saving it. A subdetail whose parent is dropped that way goes with it, since it
   * qualifies something that is no longer being recorded.
   *
   * Archiving arrives as part of the list rather than as a separate call: the old row comes back
   * with its id and an `until`, and the new value as a row without an id. Both are simply kept.
   */
  async updateDetails(
    auth: AuthDto,
    personId: string,
    dto: PersonDetailsUpdateDto,
  ): Promise<PersonDetailResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.PersonDetailUpdate, ids: [personId] });

    const items = dto.details
      .map((detail) => {
        const since = asPeriod(detail.since, detail.sincePrecision);
        const until = asPeriod(detail.until, detail.untilPrecision);

        // Compared at the coarser of the two precisions, so "Mar 2019" to "2019" is accepted: a
        // year-only date means some time in that year, not its first day.
        const coarse = [since.precision, until.precision].includes(PersonDetailDatePrecision.Year) ? 4 : 7;
        if (since.date && until.date && since.date.slice(0, coarse) > until.date.slice(0, coarse)) {
          throw new BadRequestException('A detail cannot end before it began');
        }

        return {
          id: detail.id,
          key: detail.key.trim(),
          value: detail.value.trim(),
          since: since.date,
          sincePrecision: since.precision,
          until: until.date,
          untilPrecision: until.precision,
          ...asKindFields(detail),
          subdetails: (detail.subdetails ?? [])
            .map((sub) => ({ id: sub.id, key: sub.key.trim(), value: sub.value.trim() }))
            .filter((sub) => sub.key.length > 0 && sub.value.length > 0),
        };
      })
      .filter((detail) => detail.key.length > 0 && detail.value.length > 0);

    // An id the person does not hold is a bug in the caller, not an insert: silently creating a row
    // would hide the fact that an edit was aimed at something that has since been deleted.
    const existing = await this.personDetailRepository.getForPerson(personId);
    const known = new Set(existing.flatMap((detail) => [detail.id, ...detail.subdetails.map((sub) => sub.id)]));
    for (const item of items) {
      for (const id of [item.id, ...item.subdetails.map((sub) => sub.id)]) {
        if (id && !known.has(id)) {
          throw new BadRequestException('A detail being edited does not belong to this person');
        }
      }
    }

    const details = await this.personDetailRepository.replaceForPerson(auth.user.id, personId, items);
    const groups = asAlongWithMap(await this.personDetailRepository.getAlongWith(auth.user.id, personId));
    const names = asNames(details);

    return details.map((detail) => mapPersonDetail(detail, groups, names));
  }

  /**
   * Which of the selected people already record each of the given keys.
   *
   * Asked before a bulk insert rather than reported after one, so the choice between adding a
   * second row and overwriting the first is made by someone who can see what is already there.
   *
   * Kinds are asked about apart from keys and answered with the kind in both `key` and `kind`, so
   * a contact field conflicts with the person's Current row of that kind, whatever its label.
   */
  async getConflicts(auth: AuthDto, dto: PersonDetailConflictSearchDto): Promise<PersonDetailConflictResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.PersonDetailRead, ids: dto.personIds });

    const keys = [...new Set(dto.keys.map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0))];
    const kinds = [...new Set(dto.kinds)];
    const rows = await this.personDetailRepository.getConflicts(auth.user.id, dto.personIds, keys, kinds);

    const byKey = new Map<string, PersonDetailConflictResponseDto>(
      keys.map((key) => [key, { key, kind: null, people: [] }]),
    );
    const byKind = new Map<PersonDetailKind, PersonDetailConflictResponseDto>(
      kinds.map((kind) => [kind, { key: kind, kind, people: [] }]),
    );
    for (const row of rows) {
      const conflict = row.kind ? byKind.get(row.kind) : byKey.get(row.key ?? '');
      conflict?.people.push({ id: row.personId, name: row.name, value: row.value });
    }

    return [...byKey.values(), ...byKind.values()].filter((conflict) => conflict.people.length > 0);
  }

  /**
   * Adds the same details to many people at once, on top of whatever each already holds.
   *
   * Nothing here deletes. A person named under `replaceForPersonIds` — which the client only does
   * for someone shown as already holding the key — has their Current value moved to Past, unless
   * `archiveReplaced` is false, which is the one way an existing value is lost.
   */
  async addDetails(auth: AuthDto, dto: PersonDetailsBulkAddDto): Promise<void> {
    await this.requireAccess({ auth, permission: Permission.PersonDetailUpdate, ids: dto.personIds });

    const items = dto.details
      .map((detail) => ({
        key: detail.key.trim(),
        value: detail.value.trim(),
        subdetails: (detail.subdetails ?? [])
          .map((sub) => ({ key: sub.key.trim(), value: sub.value.trim() }))
          .filter((sub) => sub.key.length > 0 && sub.value.length > 0),
        ...asKindFields(detail),
        replaceForPersonIds: detail.replaceForPersonIds ?? [],
        archiveReplaced: detail.archiveReplaced ?? true,
      }))
      .filter((detail) => detail.key.length > 0 && detail.value.length > 0);

    if (items.length === 0) {
      return;
    }

    await this.personDetailRepository.addForPeople(auth.user.id, dto.personIds, items);
  }

  async getKeySuggestions(
    auth: AuthDto,
    dto: PersonDetailSuggestionSearchDto,
  ): Promise<PersonDetailSuggestionResponseDto[]> {
    return this.personDetailRepository.getKeySuggestions(
      auth.user.id,
      dto.term?.trim() ?? '',
      asLimit(dto.limit),
      dto.parentKey?.trim() || undefined,
    );
  }

  async getValueSuggestions(
    auth: AuthDto,
    dto: PersonDetailValueSuggestionSearchDto,
  ): Promise<PersonDetailSuggestionResponseDto[]> {
    const detailKey = dto.detailKey?.trim();
    if (!dto.kind && !detailKey) {
      throw new BadRequestException('Either a detail key or a kind is required');
    }

    return this.personDetailRepository.getValueSuggestions(
      auth.user.id,
      { key: detailKey, kind: dto.kind },
      dto.term?.trim() ?? '',
      asLimit(dto.limit),
      dto.parentKey?.trim() || undefined,
    );
  }
}

const asLimit = (limit?: number) => Math.min(limit ?? DEFAULT_SUGGESTION_LIMIT, MAX_SUGGESTION_LIMIT);
