import { Injectable } from '@nestjs/common';
import { Insertable, Kysely, sql, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { PersonDetailDatePrecision, PersonDetailKind } from 'src/enum';
import { DB } from 'src/schema';
import { SavedLocationTable } from 'src/schema/tables/saved-location.table';

export interface SavedLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  createdAt: Date;
  updatedAt: Date;
}

/** A pinned Home or Work detail, with what the picker needs to show the person it belongs to. */
export interface PersonPlace {
  detailId: string;
  personId: string;
  personName: string;
  personUpdatedAt: Date;
  personIsHidden: boolean;
  kind: PersonDetailKind;
  key: string;
  value: string;
  latitude: number;
  longitude: number;
  since: Date | null;
  sincePrecision: PersonDetailDatePrecision | null;
  until: Date | null;
  untilPrecision: PersonDetailDatePrecision | null;
}

export interface PersonPlaceSearch {
  /** Text to find in the person's name, the kind, the owner's label for it, or the value. */
  query?: string;
  /** Leave Past rows out, for the list shown before anything is typed. */
  currentOnly?: boolean;
  limit: number;
}

/** The kinds that can carry a pin. Email and Phone never have one, and the writers refuse it. */
const PINNABLE_KINDS = [PersonDetailKind.Home, PersonDetailKind.Work];

/**
 * Whether `text` contains `query`, ignoring case and accents, so "eth" finds "Éthan" the way the
 * GeoNames search below it already finds "Dun Laoghaire" from "dún". Written with `strpos` rather
 * than `ilike` so a `%` or `_` typed into the picker is matched literally instead of as a wildcard.
 */
const contains = (text: ReturnType<typeof sql.ref>, query: string) =>
  sql<boolean>`strpos(f_unaccent(lower(${text})), f_unaccent(lower(${query}))) > 0`;

@Injectable()
export class SavedLocationRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  @GenerateSql({ params: [DummyValue.UUID] })
  getAll(ownerId: string): Promise<SavedLocation[]> {
    return this.db
      .selectFrom('saved_location')
      .select(['id', 'name', 'latitude', 'longitude', 'createdAt', 'updatedAt'])
      .where('ownerId', '=', ownerId)
      .orderBy(sql`lower("name")`)
      .orderBy('createdAt')
      .execute();
  }

  /**
   * The owner's saved locations whose name contains the query, in name order. No query returns them
   * all, still capped, which is what the picker lists before anything is typed.
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING, DummyValue.NUMBER] })
  search(ownerId: string, query: string | undefined, limit: number): Promise<SavedLocation[]> {
    return this.db
      .selectFrom('saved_location')
      .select(['id', 'name', 'latitude', 'longitude', 'createdAt', 'updatedAt'])
      .where('ownerId', '=', ownerId)
      .$if(!!query, (qb) => qb.where(contains(sql.ref('name'), query!)))
      .orderBy(sql`lower("name")`)
      .orderBy('createdAt')
      .limit(limit)
      .execute();
  }

  /**
   * People's places: the owner's pinned Home and Work details, Current ones first, then Past ones
   * from the most recently ended back. Within Current, people come in name order so the list reads
   * like the People page.
   *
   * A query matches the person's name, the kind token ("home", "work"), the label the owner saved
   * the kind under, or the value. Hidden people are included: they are hidden from the face grid,
   * not from the owner's own records.
   */
  @GenerateSql({ params: [DummyValue.UUID, { query: DummyValue.STRING, limit: DummyValue.NUMBER }] })
  searchPeoplesPlaces(ownerId: string, { query, currentOnly, limit }: PersonPlaceSearch): Promise<PersonPlace[]> {
    return (
      this.db
        .selectFrom('person_detail')
        .innerJoin('person', 'person.id', 'person_detail.personId')
        .select([
          'person_detail.id as detailId',
          'person.id as personId',
          'person.name as personName',
          'person.updatedAt as personUpdatedAt',
          'person.isHidden as personIsHidden',
          'person_detail.kind',
          'person_detail.key',
          'person_detail.value',
          'person_detail.latitude',
          'person_detail.longitude',
          'person_detail.since',
          'person_detail.sincePrecision',
          'person_detail.until',
          'person_detail.untilPrecision',
        ])
        // The detail's owner is the person's owner by construction; both are checked so a person row
        // that somehow disagreed could never leak another user's places.
        .where('person_detail.ownerId', '=', ownerId)
        .where('person.ownerId', '=', ownerId)
        // Repeats the predicate of `person_detail_owner_pinned_idx`, which is what lets the planner
        // use that partial index instead of scanning every detail the owner has.
        .where('person_detail.latitude', 'is not', null)
        .where('person_detail.longitude', 'is not', null)
        .where('person_detail.kind', 'in', PINNABLE_KINDS)
        .where('person_detail.parentId', 'is', null)
        .$if(!!currentOnly, (qb) => qb.where('person_detail.until', 'is', null))
        .$if(!!query, (qb) =>
          qb.where((eb) =>
            eb.or([
              contains(sql.ref('person.name'), query!),
              contains(sql.ref('person_detail.kind'), query!),
              contains(sql.ref('person_detail.key'), query!),
              contains(sql.ref('person_detail.value'), query!),
            ]),
          ),
        )
        .orderBy(sql`"person_detail"."until" is null`, 'desc')
        // Descending puts nulls first, which only ever affects the Current group, where every row is
        // null and the next keys decide.
        .orderBy('person_detail.until', 'desc')
        .orderBy(sql`lower("person"."name")`)
        .orderBy('person_detail.kind')
        .orderBy('person_detail.sortOrder')
        .limit(limit)
        .$narrowType<{ kind: PersonDetailKind; latitude: number; longitude: number }>()
        .execute() as Promise<PersonPlace[]>
    );
  }

  @GenerateSql({ params: [[{ ownerId: DummyValue.UUID, name: DummyValue.STRING, latitude: 0, longitude: 0 }]] })
  create(locations: Insertable<SavedLocationTable>[]): Promise<SavedLocation[]> {
    if (locations.length === 0) {
      return Promise.resolve([]);
    }

    return this.db
      .insertInto('saved_location')
      .values(locations)
      .returning(['id', 'name', 'latitude', 'longitude', 'createdAt', 'updatedAt'])
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID, { name: DummyValue.STRING }] })
  update(id: string, values: Updateable<SavedLocationTable>): Promise<SavedLocation> {
    return this.db
      .updateTable('saved_location')
      .set(values)
      .where('id', '=', id)
      .returning(['id', 'name', 'latitude', 'longitude', 'createdAt', 'updatedAt'])
      .executeTakeFirstOrThrow();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('saved_location').where('id', '=', id).execute();
  }
}
