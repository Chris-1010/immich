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
} from 'src/dtos/person-detail.dto';
import { Permission } from 'src/enum';
import { AlongWith, PersonDetail } from 'src/repositories/person-detail.repository';
import { BaseService } from 'src/services/base.service';

/** How many suggestions a picker shows before the list stops being worth scrolling. */
const DEFAULT_SUGGESTION_LIMIT = 10;
const MAX_SUGGESTION_LIMIT = 50;

/** The key and value as they are compared: both ends of a match are trimmed and lowercased. */
const matchKey = (key: string, value: string) => `${key.trim().toLowerCase()} ${value.trim().toLowerCase()}`;

const asAlongWithMap = (groups: AlongWith[]) =>
  new Map(groups.map((group) => [matchKey(group.key, group.value), group]));

/** The subject's own keys and subdetails, for naming a shared one back to them in their own words. */
const asNames = (details: PersonDetail[]): PersonDetailNames => ({
  keys: new Map(details.map((detail) => [detail.key.trim().toLowerCase(), detail.key])),
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
   */
  async updateDetails(
    auth: AuthDto,
    personId: string,
    dto: PersonDetailsUpdateDto,
  ): Promise<PersonDetailResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.PersonDetailUpdate, ids: [personId] });

    const items = dto.details
      .map((detail) => ({
        id: detail.id,
        key: detail.key.trim(),
        value: detail.value.trim(),
        subdetails: (detail.subdetails ?? [])
          .map((sub) => ({ id: sub.id, key: sub.key.trim(), value: sub.value.trim() }))
          .filter((sub) => sub.key.length > 0 && sub.value.length > 0),
      }))
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
   */
  async getConflicts(auth: AuthDto, dto: PersonDetailConflictSearchDto): Promise<PersonDetailConflictResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.PersonDetailRead, ids: dto.personIds });

    const keys = [...new Set(dto.keys.map((key) => key.trim().toLowerCase()).filter((key) => key.length > 0))];
    const rows = await this.personDetailRepository.getConflicts(auth.user.id, dto.personIds, keys);

    const byKey = new Map<string, PersonDetailConflictResponseDto>(keys.map((key) => [key, { key, people: [] }]));
    for (const row of rows) {
      byKey.get(row.key)?.people.push({ id: row.personId, name: row.name, value: row.value });
    }

    return [...byKey.values()].filter((conflict) => conflict.people.length > 0);
  }

  /**
   * Adds the same details to many people at once, on top of whatever each already holds.
   *
   * Nothing here deletes. The only way an existing value is lost is by naming its person under
   * `replaceForPersonIds`, which the client only does for someone shown as already holding the key.
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
        replaceForPersonIds: detail.replaceForPersonIds ?? [],
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
    return this.personDetailRepository.getValueSuggestions(
      auth.user.id,
      dto.detailKey,
      dto.term?.trim() ?? '',
      asLimit(dto.limit),
      dto.parentKey?.trim() || undefined,
    );
  }
}

const asLimit = (limit?: number) => Math.min(limit ?? DEFAULT_SUGGESTION_LIMIT, MAX_SUGGESTION_LIMIT);
