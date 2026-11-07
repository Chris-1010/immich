import { Injectable } from '@nestjs/common';
import { Kysely, sql, Transaction } from 'kysely';
import { DateTime } from 'luxon';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { PersonDetailDatePrecision, PersonDetailKind } from 'src/enum';
import { DB } from 'src/schema';

/** How many faces the along-with column will ever need behind a `+N`, however large the group is. */
const ALONG_WITH_LIMIT = 50;

/**
 * One fact qualifying a detail rather than the person: "Class of" and "2016" under a school.
 *
 * No `createdAt`, because a subdetail is never shown on its own — it is read under the detail it
 * hangs from, and that detail is the one carrying an age.
 */
export interface PersonSubdetail {
  id: string;
  key: string;
  value: string;
  sortOrder: number;
}

export interface PersonDetail {
  id: string;
  key: string;
  value: string;
  sortOrder: number;
  /** When the detail was first recorded. Shown on hover as "how long ago" beside the exact date. */
  createdAt: Date;
  since: Date | null;
  sincePrecision: PersonDetailDatePrecision | null;
  /** Null while the detail is Current; set once it is Past. */
  until: Date | null;
  untilPrecision: PersonDetailDatePrecision | null;
  /** The contact field this is, or null for free text. */
  kind: PersonDetailKind | null;
  latitude: number | null;
  longitude: number | null;
  subdetails: PersonSubdetail[];
}

/** What makes a top-level row a contact field, and where a Home or Work one is pinned. */
export interface PersonDetailKindFields {
  kind: PersonDetailKind | null;
  latitude: number | null;
  longitude: number | null;
}

/** A Since or Until date as it is written: already snapped to the start of its period. */
export interface PersonDetailDates {
  since: string | null;
  sincePrecision: PersonDetailDatePrecision | null;
  until: string | null;
  untilPrecision: PersonDetailDatePrecision | null;
}

/** One detail as the caller wants it stored. No id means a row that does not exist yet. */
export interface PersonDetailUpsert extends PersonDetailDates, PersonDetailKindFields {
  id?: string;
  key: string;
  value: string;
  subdetails: PersonSubdetailUpsert[];
}

export interface PersonSubdetailUpsert {
  id?: string;
  key: string;
  value: string;
}

export interface AlongWithPerson {
  id: string;
  name: string;
  /**
   * The lowercased key of every pair of this person's that the subject also records, including the
   * one the group is for. What is left after removing that one is what the two have in common
   * beyond it, which is what sorts a school group into the people who were also in the same year.
   */
  matchedKeys: string[];
  /**
   * The subdetails this person records under this very pair that the subject records there too,
   * lowercased, as two arrays read side by side rather than one array of pairs — a delimiter joining
   * them would have to be a character no value could contain, and no such character exists.
   *
   * Scoped to the pair by construction, since a subdetail is a fact about its parent: "2016" is only
   * the same year as another "2016" when both hang from the same school.
   */
  matchedSubKeys: string[];
  matchedSubValues: string[];
}

/** One half of an along-with group, capped on its own so neither half can crowd out the other. */
export interface AlongWithGroup {
  people: AlongWithPerson[];
  /** The true size of the half, which is above `people.length` once the cap is reached. */
  total: number;
}

/**
 * Everyone else recording the same key and value, for one of a person's details, split by whether
 * their own matching row is Current or Past.
 */
export interface AlongWith {
  key: string;
  value: string;
  current: AlongWithGroup;
  past: AlongWithGroup;
}

export interface PersonDetailSuggestion {
  value: string;
  count: number;
}

/** One person already recording a key that a bulk insert is about to write. */
export interface PersonDetailConflict {
  /** The existing row's key, lowercased, which is the form the caller matched on; null for a kind row. */
  key: string | null;
  /** The existing row's kind, for a conflict found by kind rather than by key. */
  kind: PersonDetailKind | null;
  personId: string;
  name: string;
  detailId: string;
  /** What they record under it today, in their own casing, which is what the tooltip shows. */
  value: string;
}

/** One detail as a bulk insert wants it written across many people at once. */
export interface BulkDetailItem extends PersonDetailKindFields {
  key: string;
  value: string;
  subdetails: PersonSubdetailUpsert[];
  /**
   * Who among the selected people should have their existing value under this key overwritten
   * rather than gaining a second row. Everyone else keeps what they had and gets this appended.
   */
  replaceForPersonIds: string[];
  /**
   * Whether a replaced value is moved to Past (and the new value added beside it as Current)
   * rather than overwritten in place.
   */
  archiveReplaced: boolean;
}

/** A subdetail's key and value as they are compared: both ends trimmed and lowercased. */
const matchKey = (key: string, value: string) => `${key.trim().toLowerCase()} ${value.trim().toLowerCase()}`;

/**
 * Marks a kind token apart from any free-text key. A control character, because nothing typed
 * into a key field can produce one, so the token for Home can never be read as a key spelled
 * "home". The SQL side builds the same token with `chr(1)`.
 */
const KIND_TOKEN_PREFIX = '\u0001';

/**
 * What a top-level row is matched on in place of its key: its kind for a contact field, whatever
 * key text it was saved under, or its lowercased key for a free-text detail. "Home: Rathmines"
 * saved as "Home" and as "Baile" are the same fact; "Home: Rathmines" as free text is not.
 */
export const detailKeyToken = (detail: { kind: PersonDetailKind | null; key: string }) =>
  detail.kind ? `${KIND_TOKEN_PREFIX}${detail.kind}` : detail.key.trim().toLowerCase();

/** A top-level row's identity for along-with and merging: its key token and lowercased value. */
export const detailMatchKey = (detail: { kind: PersonDetailKind | null; key: string; value: string }) =>
  `${detailKeyToken(detail)} ${detail.value.trim().toLowerCase()}`;

/** {@link detailKeyToken} in SQL, for a `person_detail` row under the given alias. */
const keyToken = (alias: string) =>
  sql<string>`case when ${sql.ref(`${alias}.kind`)} is null then lower(${sql.ref(`${alias}.key`)}) else chr(1) || ${sql.ref(`${alias}.kind`)} end`;

/** What a subdetail carries, and a top-level row whose dates are unknown. */
const NO_DATES: PersonDetailDates = { since: null, sincePrecision: null, until: null, untilPrecision: null };

/** What a subdetail carries: it is never a contact field and never pinned. */
const NO_KIND: PersonDetailKindFields = { kind: null, latitude: null, longitude: null };

const DETAIL_COLUMNS = [
  'id',
  'parentId',
  'key',
  'value',
  'sortOrder',
  'createdAt',
  'since',
  'sincePrecision',
  'until',
  'untilPrecision',
  'kind',
  'latitude',
  'longitude',
] as const;

/** Every row of a person, top level and below, as one flat list ordered the way the page reads. */
type StoredRow = {
  id: string;
  parentId: string | null;
  key: string;
  value: string;
  sortOrder: number;
  createdAt: Date;
  since: Date | null;
  sincePrecision: PersonDetailDatePrecision | null;
  until: Date | null;
  untilPrecision: PersonDetailDatePrecision | null;
  kind: PersonDetailKind | null;
  latitude: number | null;
  longitude: number | null;
};

/**
 * Nests a person's flat rows into the shape the page wants.
 *
 * A subdetail whose parent is not in the list is dropped rather than promoted. That cannot happen
 * through any writer here — the cascade takes children with their parent — so a row reaching this
 * point orphaned is a broken invariant, and showing it as a top-level fact would state something
 * about the person that nobody ever recorded.
 */
const asDetails = (rows: StoredRow[]): PersonDetail[] => {
  const details: PersonDetail[] = [];
  const byId = new Map<string, PersonDetail>();

  for (const row of rows) {
    if (row.parentId === null) {
      const detail = {
        id: row.id,
        key: row.key,
        value: row.value,
        sortOrder: row.sortOrder,
        createdAt: row.createdAt,
        since: row.since,
        sincePrecision: row.sincePrecision,
        until: row.until,
        untilPrecision: row.untilPrecision,
        kind: row.kind,
        latitude: row.latitude,
        longitude: row.longitude,
        subdetails: [],
      };

      byId.set(row.id, detail);
      details.push(detail);
    }
  }

  for (const row of rows) {
    if (row.parentId !== null) {
      byId.get(row.parentId)?.subdetails.push({ id: row.id, key: row.key, value: row.value, sortOrder: row.sortOrder });
    }
  }

  return details;
};

@Injectable()
export class PersonDetailRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [DummyValue.UUID] })
  async getForPerson(personId: string): Promise<PersonDetail[]> {
    const rows = await this.db
      .selectFrom('person_detail')
      .select(DETAIL_COLUMNS)
      .where('personId', '=', personId)
      // createdAt breaks ties between rows saved in the same batch, which all carry the sort order
      // they were given but can share it with rows written before the list was ever reordered.
      .orderBy('sortOrder')
      .orderBy('createdAt')
      .execute();

    return asDetails(rows);
  }

  /**
   * Everyone else who records one of this person's key/value pairs, grouped by the pair.
   *
   * Hidden people are deliberately not filtered out: a value is a fact about the library, and
   * hiding a face from the people grid is a statement about the grid, not about the fact. The
   * consequence is that a hidden person still appears in the header of everyone they share a
   * common value with — see the one predicate that would reverse it if that is ever unwanted.
   *
   * One query for the whole page rather than one per detail. The window functions do the two
   * things a per-row query would otherwise need round trips for: capping the faces returned while
   * still reporting how many there really are.
   *
   * Only top-level details gather anyone. A subdetail forms no group of its own, because it says
   * nothing without the detail above it — every "Class of 2016" in the library would otherwise be
   * one crowd rather than one per school. What it does instead is sort the group its parent made,
   * ahead of the plain count of pairs shared: two people at the same school and in the same year
   * have more in common than two people at the same school and the same hometown, and the year is
   * the thing the group was opened to find.
   *
   * How much each person overlaps the subject is counted across the whole matched set before the
   * cap is applied, and then orders the group. That ordering is the point of counting it there: a
   * classmate who shares three details would otherwise be as likely to fall outside the cap as an
   * alumnus who shares one, and the people worth surfacing are exactly the ones the cap must keep.
   *
   * Current and Past are ignored when matching, on both sides: someone who used to work where the
   * subject works now still shares the fact. They are read only to split each group in two by the
   * other person's own row, each half ranked and capped on its own. Someone holding the pair both
   * ways — a Past row and a Current one — counts as Current, since that is what they are today.
   *
   * Pairs are compared lowercased but not trimmed, because every write trims first — so the two
   * are equivalent on stored data. It has to be written this way: trimming here would no longer
   * match the `(ownerId, lower(key), lower(value))` index and would put the whole library through
   * a sequential scan on every page load.
   *
   * Contact fields match on kind and value instead of key and value, so a Home saved under one
   * label matches a Home saved under another. A kind row and a free-text row never match, even with
   * the same key text: the two halves of the match are kept apart in the WHERE so each still reads
   * its own index. From there on every group is keyed by the token `detailKeyToken` describes,
   * which is what the `key` column below carries — lowercased key text, or the marked kind.
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  async getAlongWith(ownerId: string, personId: string): Promise<AlongWith[]> {
    const rows = await this.db
      // One row per matching detail rather than per matching pair, because the row is what the
      // subdetails hang from. A person recording the same pair twice is collapsed further down,
      // once it is known which of their two rows has the most in common with the subject.
      .with('matched', (db) =>
        db
          .selectFrom('person_detail as detail')
          .innerJoin('person', 'person.id', 'detail.personId')
          .select([
            keyToken('detail').as('key'),
            sql<string>`lower(detail."value")`.as('value'),
            'detail.id as detailId',
            'person.id as personId',
            'person.name as name',
            // Across all of this person's rows for the pair, not just this one, because the row kept
            // further down is chosen for its subdetails and may well be the Past one.
            sql<boolean>`bool_or(detail."until" is null) over (partition by ${keyToken('detail')}, lower(detail."value"), person.id)`.as(
              'isCurrent',
            ),
          ])
          .where('detail.ownerId', '=', ownerId)
          .where('detail.personId', '!=', personId)
          .where('detail.parentId', 'is', null)
          .where(
            sql<boolean>`(
              (detail."kind" is null and (lower(detail."key"), lower(detail."value")) in (
                select lower("key"), lower("value") from "person_detail"
                where "personId" = ${personId} and "parentId" is null and "kind" is null
              ))
              or (detail."kind" is not null and (detail."kind", lower(detail."value")) in (
                select "kind", lower("value") from "person_detail"
                where "personId" = ${personId} and "parentId" is null and "kind" is not null
              ))
            )`,
          ),
      )
      // The subject's own subdetails, carrying the pair they hang from, so a match can be required
      // to agree on both ends at once.
      .with('subject', (db) =>
        db
          .selectFrom('person_detail as parent')
          .innerJoin('person_detail as sub', 'sub.parentId', 'parent.id')
          .select([
            keyToken('parent').as('key'),
            sql<string>`lower(parent."value")`.as('value'),
            sql<string>`lower(sub."key")`.as('subKey'),
            sql<string>`lower(sub."value")`.as('subValue'),
          ])
          .where('parent.personId', '=', personId)
          .where('parent.parentId', 'is', null),
      )
      .with('overlap', (db) =>
        db
          .selectFrom('matched')
          .innerJoin('person_detail as sub', 'sub.parentId', 'matched.detailId')
          .innerJoin('subject', (join) =>
            join.on(
              sql<boolean>`"subject"."key" = "matched"."key"
                and "subject"."value" = "matched"."value"
                and "subject"."subKey" = lower(sub."key")
                and "subject"."subValue" = lower(sub."value")`,
            ),
          )
          .distinct()
          .select(['matched.detailId as detailId', 'subject.subKey as subKey', 'subject.subValue as subValue']),
      )
      .with('overlapCounts', (db) =>
        db
          .selectFrom('overlap')
          .select([
            'detailId',
            (eb) => eb.fn.countAll<string>().as('subShared'),
            sql<string[]>`array_agg("subKey")`.as('subKeys'),
            sql<string[]>`array_agg("subValue")`.as('subValues'),
          ])
          .groupBy('detailId'),
      )
      // One row per person per pair again, keeping whichever of their rows agrees with the subject
      // on the most subdetails. Two rows for one pair are the same fact stated twice, and the face
      // shown for it should be the one with the most behind it.
      .with('best', (db) =>
        db
          .selectFrom('matched')
          .leftJoin('overlapCounts', 'overlapCounts.detailId', 'matched.detailId')
          .select([
            'matched.key as key',
            'matched.value as value',
            'matched.personId as personId',
            'matched.name as name',
            'matched.isCurrent as isCurrent',
            sql<number>`coalesce("overlapCounts"."subShared", 0)`.as('subShared'),
            sql<string[]>`coalesce("overlapCounts"."subKeys", '{}')`.as('subKeys'),
            sql<string[]>`coalesce("overlapCounts"."subValues", '{}')`.as('subValues'),
          ])
          .distinctOn(['matched.key', 'matched.value', 'matched.personId'])
          .orderBy('matched.key')
          .orderBy('matched.value')
          .orderBy('matched.personId')
          .orderBy(sql`coalesce("overlapCounts"."subShared", 0)`, 'desc'),
      )
      .with('scored', (db) =>
        db
          .selectFrom('best')
          .selectAll()
          .select([
            sql<number>`count(*) over (partition by "personId")`.as('shared'),
            sql<string[]>`array_agg("key") over (partition by "personId")`.as('matchedKeys'),
          ]),
      )
      .with('ranked', (db) =>
        db
          .selectFrom('scored')
          .selectAll()
          .select([
            sql<number>`row_number() over (partition by "key", "value", "isCurrent" order by "subShared" desc, "shared" desc, "name", "personId")`.as(
              'rank',
            ),
            sql<number>`count(*) over (partition by "key", "value", "isCurrent")`.as('total'),
          ]),
      )
      .selectFrom('ranked')
      .selectAll()
      .where('rank', '<=', ALONG_WITH_LIMIT)
      .orderBy('key')
      .orderBy('value')
      .orderBy('isCurrent', 'desc')
      .orderBy('rank')
      .execute();

    const groups: AlongWith[] = [];
    const byPair = new Map<string, AlongWith>();

    for (const row of rows) {
      const pair = matchKey(row.key, row.value);
      let group = byPair.get(pair);
      if (!group) {
        group = { key: row.key, value: row.value, current: { people: [], total: 0 }, past: { people: [], total: 0 } };
        byPair.set(pair, group);
        groups.push(group);
      }

      const half = row.isCurrent ? group.current : group.past;
      half.total = Number(row.total);
      half.people.push({
        id: row.personId,
        name: row.name,
        matchedKeys: row.matchedKeys,
        matchedSubKeys: row.subKeys,
        matchedSubValues: row.subValues,
      });
    }

    return groups;
  }

  /**
   * The keys already in use across the owner's whole library, most used first, so a key typed on
   * one person is offered on the next.
   *
   * Keys are counted by their exact text and then collapsed by their lowercased form, keeping the
   * casing the owner has used most. That is what makes a suggestion list free of near-duplicates,
   * and it is the same answer the casing-snap rule needs on write.
   *
   * The two levels are kept apart. Without a parent key only top-level keys are offered, since
   * "Class of" is not something to record about a person on its own; with one, only the keys
   * already written under that same parent key are, which is what makes the subdetail row of a
   * school offer the years rather than the whole library's vocabulary.
   *
   * Contact-field rows are left out: their key is the kind's name, which has a chip of its own, and
   * offering it as a free-text key would only invite a second, unkinded "Home".
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING, DummyValue.NUMBER] })
  async getKeySuggestions(
    ownerId: string,
    term: string,
    limit: number,
    parentKey?: string,
  ): Promise<PersonDetailSuggestion[]> {
    const rows = await this.db
      .with('counts', (db) =>
        db
          .selectFrom('person_detail as detail')
          .select(['detail.key as key', (eb) => eb.fn.countAll<string>().as('count')])
          .where('detail.ownerId', '=', ownerId)
          .where('detail.kind', 'is', null)
          .$if(!parentKey, (qb) => qb.where('detail.parentId', 'is', null))
          .$if(!!parentKey, (qb) =>
            qb
              .innerJoin('person_detail as parent', 'parent.id', 'detail.parentId')
              .where(sql`lower(parent."key")`, '=', parentKey?.trim().toLowerCase() ?? ''),
          )
          .$if(term.length > 0, (qb) => qb.where('detail.key', 'ilike', `%${term}%`))
          .groupBy('detail.key'),
      )
      .with('ranked', (db) =>
        db
          .selectFrom('counts')
          .select([
            'key',
            sql<string>`sum("count") over (partition by lower("key"))`.as('total'),
            sql<number>`row_number() over (partition by lower("key") order by "count" desc, "key")`.as('rank'),
          ]),
      )
      .selectFrom('ranked')
      .select(['key as value', 'total'])
      .where('rank', '=', 1)
      .orderBy('total', 'desc')
      .orderBy('value')
      .limit(limit)
      .execute();

    return rows.map((row) => ({ value: row.value, count: Number(row.total) }));
  }

  /**
   * The values recorded under one key, ranked the same way and scoped the same way as the keys.
   *
   * A key names free-text rows only; a kind names that contact field's rows, whatever key text they
   * were saved under. Either way the two never mix, matching how along-with groups them. Under a
   * parent key the kind is not read: a subdetail has none, and its parent is found by key text.
   */
  @GenerateSql({ params: [DummyValue.UUID, { key: DummyValue.STRING }, DummyValue.STRING, DummyValue.NUMBER] })
  async getValueSuggestions(
    ownerId: string,
    by: { key?: string; kind?: PersonDetailKind },
    term: string,
    limit: number,
    parentKey?: string,
  ): Promise<PersonDetailSuggestion[]> {
    const rows = await this.db
      .with('counts', (db) =>
        db
          .selectFrom('person_detail as detail')
          .select(['detail.value as value', (eb) => eb.fn.countAll<string>().as('count')])
          .where('detail.ownerId', '=', ownerId)
          .$if(!!by.kind, (qb) => qb.where('detail.kind', '=', by.kind!))
          .$if(!by.kind, (qb) => qb.where(sql`lower(detail."key")`, '=', by.key?.trim().toLowerCase() ?? ''))
          .$if(!by.kind && !parentKey, (qb) => qb.where('detail.kind', 'is', null))
          .$if(!parentKey, (qb) => qb.where('detail.parentId', 'is', null))
          .$if(!!parentKey, (qb) =>
            qb
              .innerJoin('person_detail as parent', 'parent.id', 'detail.parentId')
              .where(sql`lower(parent."key")`, '=', parentKey?.trim().toLowerCase() ?? ''),
          )
          .$if(term.length > 0, (qb) => qb.where('detail.value', 'ilike', `%${term}%`))
          .groupBy('detail.value'),
      )
      .with('ranked', (db) =>
        db
          .selectFrom('counts')
          .select([
            'value',
            sql<string>`sum("count") over (partition by lower("value"))`.as('total'),
            sql<number>`row_number() over (partition by lower("value") order by "count" desc, "value")`.as('rank'),
          ]),
      )
      .selectFrom('ranked')
      .select(['value', 'total'])
      .where('rank', '=', 1)
      .orderBy('total', 'desc')
      .orderBy('value')
      .limit(limit)
      .execute();

    return rows.map((row) => ({ value: row.value, count: Number(row.total) }));
  }

  /**
   * Which of the given people already record any of the given keys, and what they record under it.
   *
   * What a bulk insert needs in order to say, before anything is written, whose list it is about to
   * add a second entry to. One row per person per key: someone holding a key twice is reported by
   * their first, since that is the one a replacement would rewrite.
   *
   * Only Current rows conflict. A Past value is history the new one cannot clash with — adding
   * "Works at: Google" to someone who used to work at Intel is not a choice between the two.
   *
   * Keys find free-text rows and kinds find contact-field rows, never the other way round: a Home
   * conflicts with another Home whatever either is labelled, and a free-text "Home" with neither.
   */
  @GenerateSql({ params: [DummyValue.UUID, [DummyValue.UUID], [DummyValue.STRING], [PersonDetailKind.Home]] })
  async getConflicts(
    ownerId: string,
    personIds: string[],
    keys: string[],
    kinds: PersonDetailKind[] = [],
  ): Promise<PersonDetailConflict[]> {
    if (personIds.length === 0 || (keys.length === 0 && kinds.length === 0)) {
      return [];
    }

    const lowered = keys.map((key) => key.trim().toLowerCase());
    const rows = await this.db
      .selectFrom('person_detail as detail')
      .innerJoin('person', 'person.id', 'detail.personId')
      .select([
        sql<string | null>`case when detail."kind" is null then lower(detail."key") end`.as('key'),
        'detail.kind as kind',
        'person.id as personId',
        'person.name as name',
        'detail.id as detailId',
        'detail.value as value',
      ])
      .where('detail.ownerId', '=', ownerId)
      .where('detail.personId', 'in', personIds)
      .where('detail.parentId', 'is', null)
      .where('detail.until', 'is', null)
      .where((eb) =>
        eb.or([
          ...(lowered.length > 0
            ? [eb.and([eb('detail.kind', 'is', null), eb(sql`lower(detail."key")`, 'in', lowered)])]
            : []),
          ...(kinds.length > 0 ? [eb('detail.kind', 'in', kinds)] : []),
        ]),
      )
      .distinctOn([keyToken('detail'), 'detail.personId'])
      .orderBy(keyToken('detail'))
      .orderBy('detail.personId')
      .orderBy('detail.sortOrder')
      .orderBy('detail.createdAt')
      .execute();

    return rows;
  }

  /**
   * Writes the same details onto many people at once, adding to what each already holds rather
   * than replacing it.
   *
   * Three outcomes per person per detail, and which one applies is decided from what they hold
   * rather than from what the caller assumed: a person already recording this exact pair keeps the
   * row they have, a person the caller marked for replacement has their existing value replaced,
   * and everyone else gains a row at the end of their list.
   *
   * Only Current rows are weighed. A Past row with the same pair is history, so the person still
   * gains a Current one, and a Past row under the key is never what a replacement replaces.
   *
   * A replacement either archives or overwrites. Archiving gives every Current row of the key an
   * `until` of this month — subdetails stay where they are, on the row they were written under —
   * and adds the new value as a fresh Current row in the first archived row's place. Overwriting
   * rewrites the first row in place, as it always did, keeping its subdetails under the new value.
   *
   * Subdetails are merged into whichever row that leaves, never duplicated. That is the case the
   * whole feature is for — adding a year to twelve people who already have the school — and it
   * would not work if an untouched row were also left untouched by its subdetails.
   *
   * A contact field is weighed against the person's Current rows of the same kind, never by key
   * text, and a free-text item only against free-text rows. A pinned item that lands on a row the
   * person already holds gives that row its pin; one without a pin leaves the row's pin alone.
   */
  async addForPeople(ownerId: string, personIds: string[], items: BulkDetailItem[]): Promise<void> {
    if (personIds.length === 0 || items.length === 0) {
      return;
    }

    await this.db.transaction().execute(async (tx) => {
      const casings = await keyCasings(tx, ownerId);
      const thisMonth = DateTime.now().startOf('month').toISODate();

      for (const personId of personIds) {
        const rows: Array<{
          id: string;
          parentId: string | null;
          key: string;
          value: string;
          sortOrder: number;
          kind: PersonDetailKind | null;
          isCurrent: boolean;
        }> = await tx
          .selectFrom('person_detail')
          .select([
            'id',
            'parentId',
            'key',
            'value',
            'sortOrder',
            'kind',
            sql<boolean>`"until" is null`.as('isCurrent'),
          ])
          .where('personId', '=', personId)
          .orderBy('sortOrder')
          .orderBy('createdAt')
          .execute();

        let nextSortOrder = Math.max(0, ...rows.filter((row) => row.parentId === null).map((row) => row.sortOrder + 1));

        for (const item of items) {
          const key = casings.get(item.key.trim().toLowerCase()) ?? item.key.trim();
          const value = item.value.trim();

          const { kind, latitude, longitude } = item;
          const pin = kind && latitude !== null && longitude !== null ? { latitude, longitude } : undefined;

          const held = rows.filter(
            (row) =>
              row.parentId === null &&
              row.isCurrent &&
              (kind ? row.kind === kind : row.kind === null && row.key.toLowerCase() === key.toLowerCase()),
          );
          const exact = held.find((row) => row.value.toLowerCase() === value.toLowerCase());
          const replacing = held.length > 0 && item.replaceForPersonIds.includes(personId);

          let targetId: string;
          if (exact) {
            targetId = exact.id;
            if (pin) {
              await tx.updateTable('person_detail').set(pin).where('id', '=', targetId).execute();
            }
          } else if (replacing && !item.archiveReplaced) {
            targetId = held[0].id;
            // An overwritten place is a different place, so the old pin cannot stay with it.
            const moved = kind ? (pin ?? { latitude: null, longitude: null }) : {};
            await tx
              .updateTable('person_detail')
              .set({ key, value, ...moved })
              .where('id', '=', targetId)
              .execute();
          } else {
            let sortOrder = nextSortOrder;
            if (replacing) {
              await tx
                .updateTable('person_detail')
                .set({ until: thisMonth, untilPrecision: PersonDetailDatePrecision.Month })
                .where(
                  'id',
                  'in',
                  held.map((row) => row.id),
                )
                .execute();
              for (const row of held) {
                row.isCurrent = false;
              }
              // The new value takes the old one's place in the Current list rather than going to
              // the end; the archived row keeps its sort order, which the Past list does not read.
              sortOrder = held[0].sortOrder;
            }

            const inserted = await tx
              .insertInto('person_detail')
              .values({ ownerId, personId, key, value, sortOrder, kind, ...pin })
              .returning('id')
              .executeTakeFirstOrThrow();

            targetId = inserted.id;
            rows.push({ id: targetId, parentId: null, key, value, sortOrder, kind, isCurrent: true });
            if (!replacing) {
              nextSortOrder += 1;
            }
          }

          casings.set(key.toLowerCase(), key);

          const children = rows.filter((row) => row.parentId === targetId);
          let nextSubOrder = Math.max(0, ...children.map((row) => row.sortOrder + 1));

          for (const sub of item.subdetails) {
            const subKey = casings.get(sub.key.trim().toLowerCase()) ?? sub.key.trim();
            const subValue = sub.value.trim();
            const alreadyThere = children.some(
              (row) =>
                row.key.toLowerCase() === subKey.toLowerCase() && row.value.toLowerCase() === subValue.toLowerCase(),
            );

            if (alreadyThere) {
              continue;
            }

            const insertedSub = await tx
              .insertInto('person_detail')
              .values({ ownerId, personId, parentId: targetId, key: subKey, value: subValue, sortOrder: nextSubOrder })
              .returning('id')
              .executeTakeFirstOrThrow();

            children.push({
              id: insertedSub.id,
              parentId: targetId,
              key: subKey,
              value: subValue,
              sortOrder: nextSubOrder,
              kind: null,
              isCurrent: true,
            });
            casings.set(subKey.toLowerCase(), subKey);
            nextSubOrder += 1;
          }
        }
      }
    });
  }

  /**
   * Writes a person's whole list at once: the array the caller sends is what the person ends up
   * with, in that order.
   *
   * A bulk replace rather than per-row edits because the modal edits the list as a whole — a row
   * moved, a row removed and a row added are one action to the owner, and reconciling them in one
   * transaction is what stops a half-applied list being visible.
   *
   * Items carrying an id update the row they name; items without one are inserted. Ids the person
   * does not hold are rejected by the caller before this runs, so an id that reaches here and
   * matches nothing simply updates nothing.
   *
   * Past rows are part of the list like any other: one sent back is kept, one left out is deleted.
   * Archiving is therefore two items — the old row with its id and an `until`, still carrying its
   * subdetails, and the new value without an id — and nothing here has to know which is which.
   * Dates are written on top-level rows only, and cleared on anything written as a subdetail, since
   * a subdetail lives and dies with its parent. Kind and pin likewise: written on top-level rows
   * as sent, always cleared on a subdetail.
   */
  async replaceForPerson(ownerId: string, personId: string, items: PersonDetailUpsert[]): Promise<PersonDetail[]> {
    return this.db.transaction().execute(async (tx) => {
      const existing = await tx.selectFrom('person_detail').select('id').where('personId', '=', personId).execute();

      const keeping = new Set(
        items.flatMap((item) => [item.id, ...item.subdetails.map((sub) => sub.id)]).filter((id): id is string => !!id),
      );

      const removed = existing.map((row) => row.id).filter((id) => !keeping.has(id));
      if (removed.length > 0) {
        await tx.deleteFrom('person_detail').where('id', 'in', removed).execute();
      }

      const casings = await keyCasings(tx, ownerId);

      // A key already in the library keeps the casing the library uses, so "hometown" typed here
      // joins the "Hometown" everyone else is grouped under instead of splitting the group. A key
      // introduced by this batch is itself the casing later rows in the batch snap to.
      const write = async (
        item: PersonSubdetailUpsert,
        parentId: string | null,
        sortOrder: number,
        dates: PersonDetailDates = NO_DATES,
        kindFields: PersonDetailKindFields = NO_KIND,
      ) => {
        const value = item.value.trim();
        const typed = item.key.trim();
        const key = casings.get(typed.toLowerCase()) ?? typed;
        casings.set(key.toLowerCase(), key);

        if (item.id) {
          await tx
            .updateTable('person_detail')
            .set({ key, value, sortOrder, parentId, ...dates, ...kindFields })
            .where('id', '=', item.id)
            .where('personId', '=', personId)
            .execute();

          return item.id;
        }

        const inserted = await tx
          .insertInto('person_detail')
          .values({ ownerId, personId, parentId, key, value, sortOrder, ...dates, ...kindFields })
          .returning('id')
          .executeTakeFirstOrThrow();

        return inserted.id;
      };

      for (const [sortOrder, item] of items.entries()) {
        const { since, sincePrecision, until, untilPrecision, kind, latitude, longitude } = item;
        const parentId = await write(
          item,
          null,
          sortOrder,
          { since, sincePrecision, until, untilPrecision },
          { kind, latitude, longitude },
        );

        for (const [subOrder, sub] of item.subdetails.entries()) {
          await write(sub, parentId, subOrder);
        }
      }

      const rows = await tx
        .selectFrom('person_detail')
        .select(DETAIL_COLUMNS)
        .where('personId', '=', personId)
        .orderBy('sortOrder')
        .orderBy('createdAt')
        .execute();

      return asDetails(rows);
    });
  }

  /**
   * Moves a merged person's details onto the person they are merged into, before the merged person
   * is deleted and the foreign key cascade would take the details with them.
   *
   * The moved rows land after the ones the surviving person already holds, so the primary's own
   * ordering survives the merge. A pair the primary already records is dropped rather than moved:
   * the same fact stated twice is noise, and the primary's row is the one already positioned. Its
   * subdetails are not dropped with it, since a duplicate school can still be the only place a year
   * was ever written down — they are merged into the row that survives, minus any already there.
   * Contact fields are paired by kind and value, the same way along-with pairs them.
   */
  async reassign(fromPersonId: string, toPersonId: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const rows = await tx
        .selectFrom('person_detail')
        .select(['id', 'personId', 'parentId', 'key', 'value', 'sortOrder', 'kind'])
        .where('personId', 'in', [fromPersonId, toPersonId])
        .orderBy('sortOrder')
        .orderBy('createdAt')
        .execute();

      const children = new Map<string, typeof rows>();
      for (const row of rows) {
        if (row.parentId !== null) {
          const siblings = children.get(row.parentId) ?? [];
          siblings.push(row);
          children.set(row.parentId, siblings);
        }
      }

      const heldBy = new Map<string, string>();
      let nextSortOrder = 0;
      const moving: typeof rows = [];

      for (const row of rows) {
        if (row.parentId !== null) {
          continue;
        }

        if (row.personId === toPersonId) {
          heldBy.set(detailMatchKey(row), row.id);
          nextSortOrder = Math.max(nextSortOrder, row.sortOrder + 1);
        } else {
          moving.push(row);
        }
      }

      const redundant: string[] = [];
      for (const row of moving) {
        const pair = detailMatchKey(row);
        const survivor = heldBy.get(pair);

        if (survivor) {
          redundant.push(row.id);

          const held = new Set((children.get(survivor) ?? []).map((sub) => matchKey(sub.key, sub.value)));
          let nextSubOrder = Math.max(0, ...(children.get(survivor) ?? []).map((sub) => sub.sortOrder + 1));

          for (const sub of children.get(row.id) ?? []) {
            if (held.has(matchKey(sub.key, sub.value))) {
              continue;
            }

            held.add(matchKey(sub.key, sub.value));
            await tx
              .updateTable('person_detail')
              .set({ personId: toPersonId, parentId: survivor, sortOrder: nextSubOrder })
              .where('id', '=', sub.id)
              .execute();
            nextSubOrder += 1;
          }

          continue;
        }

        heldBy.set(pair, row.id);
        await tx
          .updateTable('person_detail')
          .set({ personId: toPersonId, sortOrder: nextSortOrder })
          .where('id', '=', row.id)
          .execute();
        nextSortOrder += 1;

        // Subdetails carry a person of their own as well as a parent, so a parent moved without
        // them leaves them behind to be taken by the cascade when the merged person is deleted.
        for (const sub of children.get(row.id) ?? []) {
          await tx.updateTable('person_detail').set({ personId: toPersonId }).where('id', '=', sub.id).execute();
        }
      }

      if (redundant.length > 0) {
        await tx.deleteFrom('person_detail').where('id', 'in', redundant).execute();
      }
    });
  }
}

/** The casing each of an owner's keys is most often written in, keyed by its lowercased form. */
const keyCasings = async (tx: Transaction<DB>, ownerId: string): Promise<Map<string, string>> => {
  const rows = await tx
    .with('counts', (db) =>
      db
        .selectFrom('person_detail')
        .select(['key', (db) => db.fn.countAll<string>().as('count')])
        .where('ownerId', '=', ownerId)
        .groupBy('key'),
    )
    .selectFrom('counts')
    .select('key')
    .distinctOn(sql`lower("key")`)
    .orderBy(sql`lower("key")`)
    .orderBy('count', 'desc')
    .orderBy('key')
    .execute();

  return new Map(rows.map((row) => [row.key.toLowerCase(), row.key]));
};
