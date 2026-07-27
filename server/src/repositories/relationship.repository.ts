import { Injectable } from '@nestjs/common';
import { Kysely, sql, Transaction } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { DB } from 'src/schema';
import {
  AgeGap,
  ageGapForName,
  genderForName,
  invertAgeGap,
  Orderable,
  orderRelatedPeople,
  sortRankForName,
  symmetricAgeGap,
} from 'src/utils/relationship';

/**
 * The starter set seeded for an owner who has no types yet. Each entry is one pair; an entry
 * whose two halves are equal is symmetric and becomes a single row pointing at itself.
 *
 * Names repeat on purpose — gender is carried by the pair, not by the person, so Uncle/Nephew
 * and Uncle/Niece are two distinct pairs.
 */
export const STARTER_RELATIONSHIP_TYPES: Array<[name: string, inverseName: string]> = [
  ['Parent', 'Child'],
  ['Grandparent', 'Grandchild'],
  ['Sibling', 'Sibling'],
  ['Cousin', 'Cousin'],
  ['Uncle', 'Nephew'],
  ['Uncle', 'Niece'],
  ['Aunt', 'Nephew'],
  ['Aunt', 'Niece'],
  ['Work', 'Work'],
  ['College', 'College'],
  ['Secondary School', 'Secondary School'],
];

export interface RelationshipTypePair extends AgeGap {
  id: string;
  name: string;
  inverseId: string;
  inverseName: string;
}

/** One relationship as read from a given person's page: the type always describes the counterpart. */
export interface PersonRelationshipLabel {
  id: string;
  typeId: string;
  typeName: string;
  inverseId: string;
  inverseName: string;
}

/** A counterpart of the person whose page is being read, with every label that person holds. */
export interface RelatedPerson extends Orderable {
  id: string;
  name: string;
  thumbnailPath: string;
  relationships: PersonRelationshipLabel[];
}

export interface CoAppearance {
  id: string;
  name: string;
  thumbnailPath: string;
  sharedAssets: number;
}

/**
 * A symmetric type states one fact, so it gets one row: the smaller person id is stored as the
 * subject. Adding "Sibling" from either page then lands on the same row and the unique constraint
 * rejects the second attempt. Asymmetric rows are stored exactly as entered — direction is the
 * whole point of them.
 */
export const canonicalOrder = (
  type: { id: string; inverseId: string },
  subjectId: string,
  counterpartId: string,
): { subjectId: string; counterpartId: string } => {
  const isSymmetric = type.id === type.inverseId;
  if (isSymmetric && counterpartId < subjectId) {
    return { subjectId: counterpartId, counterpartId: subjectId };
  }

  return { subjectId, counterpartId };
};

@Injectable()
export class RelationshipRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  /**
   * Every type is joined to its inverse: a type with no inverse only exists inside the
   * transaction that creates a pair, so an unpaired row is a broken row and stays hidden.
   */
  @GenerateSql({ params: [DummyValue.UUID] })
  getTypes(ownerId: string) {
    return this.db
      .selectFrom('relationship_type')
      .innerJoin('relationship_type as inverse', 'inverse.id', 'relationship_type.inverseId')
      .select([
        'relationship_type.id',
        'relationship_type.name',
        'relationship_type.minAgeGap',
        'relationship_type.maxAgeGap',
        'relationship_type.gender',
        'inverse.id as inverseId',
        'inverse.name as inverseName',
        'inverse.gender as inverseGender',
      ])
      .where('relationship_type.ownerId', '=', ownerId)
      .orderBy('relationship_type.name')
      .orderBy('inverse.name')
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getType(id: string) {
    return this.db
      .selectFrom('relationship_type')
      .innerJoin('relationship_type as inverse', 'inverse.id', 'relationship_type.inverseId')
      .select([
        'relationship_type.id',
        'relationship_type.name',
        'relationship_type.ownerId',
        'relationship_type.minAgeGap',
        'relationship_type.maxAgeGap',
        'inverse.id as inverseId',
        'inverse.name as inverseName',
      ])
      .where('relationship_type.id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Creates a type together with its inverse. A blank inverse name, or one equal to the name,
   * makes the type symmetric: one row whose inverse is itself.
   */
  createTypePair({
    ownerId,
    name,
    inverseName,
    ageGap,
  }: {
    ownerId: string;
    name: string;
    inverseName?: string | null;
    ageGap?: AgeGap;
  }) {
    return this.db.transaction().execute((tx) => createTypePair(tx, { ownerId, name, inverseName, ageGap }));
  }

  /**
   * Inserts the starter set for an owner who has none. Does nothing if the owner already has
   * types, so a concurrent second call cannot double up the whole set.
   */
  async seedTypes(ownerId: string): Promise<RelationshipTypePair[]> {
    return this.db.transaction().execute(async (tx) => {
      const existing = await tx
        .selectFrom('relationship_type')
        .select('id')
        .where('ownerId', '=', ownerId)
        .executeTakeFirst();

      if (existing) {
        return [];
      }

      const pairs: RelationshipTypePair[] = [];
      for (const [name, inverseName] of STARTER_RELATIONSHIP_TYPES) {
        pairs.push(await createTypePair(tx, { ownerId, name, inverseName }));
      }

      return pairs;
    });
  }

  /**
   * Renames a single half of a pair. The other half is renamed by a second call.
   *
   * The gender goes with the name, since that is where it came from: renaming "Nephew" to "Godson"
   * keeps the half male, and renaming it to something unrecognised leaves it stating nothing.
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING] })
  async renameType(id: string, name: string): Promise<void> {
    await this.db
      .updateTable('relationship_type')
      .set({ name, gender: genderForName(name) })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Sets the expected age range on both halves of a pair at once: the inverse holds the same
   * expectation read from the other end, so it is stored negated rather than as entered.
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID, { minAgeGap: 15, maxAgeGap: 60 }] })
  async setAgeGap(id: string, inverseId: string, ageGap: AgeGap): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await tx.updateTable('relationship_type').set(ageGap).where('id', '=', id).execute();
      if (inverseId !== id) {
        await tx.updateTable('relationship_type').set(invertAgeGap(ageGap)).where('id', '=', inverseId).execute();
      }
    });
  }

  /** The birth dates of two people, for working out the age gap the type picker is ordered by. */
  @GenerateSql({ params: [[DummyValue.UUID]] })
  getBirthDates(ids: string[]) {
    return this.db.selectFrom('person').select(['id', 'birthDate']).where('id', 'in', ids).execute();
  }

  /**
   * Every gender the labels these people already hold state about them, one row per label that
   * states anything. Read from each person's own end: a label on a row where they are the
   * counterpart describes them, and on a row where they are the subject its inverse does.
   *
   * Returned as evidence rather than a verdict so that labels disagreeing can be spotted — see
   * {@link inferGender}.
   */
  @GenerateSql({ params: [[DummyValue.UUID]] })
  getGenderEvidence(ids: string[]) {
    const described = this.db
      .selectFrom('person_relationship')
      .innerJoin('relationship_type as type', 'type.id', 'person_relationship.typeId')
      .select(['person_relationship.counterpartId as personId', 'type.gender as gender'])
      .where('person_relationship.counterpartId', 'in', ids)
      .where('type.gender', 'is not', null);

    const describing = this.db
      .selectFrom('person_relationship')
      .innerJoin('relationship_type as type', 'type.id', 'person_relationship.typeId')
      .innerJoin('relationship_type as inverse', 'inverse.id', 'type.inverseId')
      .select(['person_relationship.subjectId as personId', 'inverse.gender as gender'])
      .where('person_relationship.subjectId', 'in', ids)
      .where('inverse.gender', 'is not', null);

    return this.db.selectFrom(described.unionAll(describing).as('evidence')).selectAll().execute();
  }

  /**
   * Deletes both halves of a pair, and with them — by foreign key cascade — every relationship
   * using either half.
   */
  @GenerateSql({ params: [DummyValue.UUID] })
  async deleteTypePair(id: string): Promise<void> {
    await this.db
      .deleteFrom('relationship_type')
      .where((eb) => eb.or([eb('id', '=', id), eb('inverseId', '=', id)]))
      .execute();
  }

  /** The relationships a pair deletion would take with it, for the confirmation count. */
  @GenerateSql({ params: [DummyValue.UUID] })
  getRelationshipsUsingPair(id: string) {
    return this.db
      .selectFrom('person_relationship')
      .innerJoin('relationship_type', 'relationship_type.id', 'person_relationship.typeId')
      .select(['person_relationship.subjectId', 'person_relationship.counterpartId'])
      .where((eb) => eb.or([eb('relationship_type.id', '=', id), eb('relationship_type.inverseId', '=', id)]))
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  getRelationship(id: string) {
    return this.db
      .selectFrom('person_relationship')
      .selectAll('person_relationship')
      .where('id', '=', id)
      .executeTakeFirst();
  }

  /** Looks a relationship up by its natural key, so a duplicate add can return the existing row. */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID, DummyValue.UUID] })
  getRelationshipByKey(subjectId: string, counterpartId: string, typeId: string) {
    return this.db
      .selectFrom('person_relationship')
      .selectAll('person_relationship')
      .where('subjectId', '=', subjectId)
      .where('counterpartId', '=', counterpartId)
      .where('typeId', '=', typeId)
      .executeTakeFirst();
  }

  /**
   * Adding a relationship that already exists is a no-op: the insert is skipped and nothing is
   * returned. Callers must canonicalise the direction with {@link canonicalOrder} first,
   * otherwise a mirrored symmetric row slips past the unique constraint.
   */
  @GenerateSql({
    params: [
      {
        ownerId: DummyValue.UUID,
        subjectId: DummyValue.UUID,
        counterpartId: DummyValue.UUID,
        typeId: DummyValue.UUID,
      },
    ],
  })
  create(relationship: { ownerId: string; subjectId: string; counterpartId: string; typeId: string }) {
    return this.db
      .insertInto('person_relationship')
      .values(relationship)
      .onConflict((oc) => oc.columns(['subjectId', 'counterpartId', 'typeId']).doNothing())
      .returningAll()
      .executeTakeFirst();
  }

  /** Relabelling changes the type, and with it the direction when the new type is symmetric. */
  @GenerateSql({
    params: [DummyValue.UUID, { subjectId: DummyValue.UUID, counterpartId: DummyValue.UUID, typeId: DummyValue.UUID }],
  })
  async update(id: string, relationship: { subjectId: string; counterpartId: string; typeId: string }): Promise<void> {
    await this.db.updateTable('person_relationship').set(relationship).where('id', '=', id).execute();
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async remove(id: string): Promise<void> {
    await this.db.deleteFrom('person_relationship').where('id', '=', id).execute();
  }

  /**
   * Moves every relationship of a merged person onto the person they are merged into, before the
   * merged person is deleted and the foreign key cascade would take their relationships with them.
   *
   * Two kinds of row cannot survive the move and are dropped instead: a relationship between the
   * two people being merged, which would become a self-relationship, and one that duplicates a
   * fact the surviving person already records. Symmetric rows are re-canonicalised, since the
   * person id they are ordered by has changed.
   */
  async reassignRelationships(oldPersonId: string, newPersonId: string): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      const rows = await tx
        .selectFrom('person_relationship')
        .innerJoin('relationship_type as type', 'type.id', 'person_relationship.typeId')
        .select([
          'person_relationship.id',
          'person_relationship.subjectId',
          'person_relationship.counterpartId',
          'person_relationship.typeId',
          'type.inverseId',
        ])
        .where((eb) =>
          eb.or([
            eb('person_relationship.subjectId', 'in', [oldPersonId, newPersonId]),
            eb('person_relationship.counterpartId', 'in', [oldPersonId, newPersonId]),
          ]),
        )
        .orderBy('person_relationship.createdAt')
        .execute();

      const seen = new Set<string>();
      // Rows the merge does not touch keep their place, so the facts they already record win.
      const moving: typeof rows = [];
      for (const row of rows) {
        if (row.subjectId === oldPersonId || row.counterpartId === oldPersonId) {
          moving.push(row);
        } else {
          seen.add(factKey(row.subjectId, row.counterpartId, row.typeId, row.inverseId));
        }
      }

      const redundant: string[] = [];
      for (const row of moving) {
        const moved = canonicalOrder(
          // A type with no inverse is a broken row, never a symmetric one, so it keeps its direction.
          { id: row.typeId, inverseId: row.inverseId ?? '' },
          row.subjectId === oldPersonId ? newPersonId : row.subjectId,
          row.counterpartId === oldPersonId ? newPersonId : row.counterpartId,
        );

        const key = factKey(moved.subjectId, moved.counterpartId, row.typeId, row.inverseId);
        if (moved.subjectId === moved.counterpartId || seen.has(key)) {
          redundant.push(row.id);
          continue;
        }

        seen.add(key);
        await tx.updateTable('person_relationship').set(moved).where('id', '=', row.id).execute();
      }

      if (redundant.length > 0) {
        await tx.deleteFrom('person_relationship').where('id', 'in', redundant).execute();
      }
    });
  }

  /**
   * Every counterpart of a person, grouped, with the labels read from that person's end: rows
   * where they are the subject carry the type itself, rows where they are the counterpart carry
   * its inverse. This is also the shape a Venn diagram of a person's types needs.
   *
   * The people come back in the order the page should render them — see
   * {@link orderRelatedPeople} — which is why the saved manual order is joined in here.
   */
  @GenerateSql({ params: [DummyValue.UUID] })
  async getRelatedPeople(personId: string): Promise<RelatedPerson[]> {
    const asSubject = this.db
      .selectFrom('person_relationship')
      .innerJoin('relationship_type as type', 'type.id', 'person_relationship.typeId')
      .innerJoin('relationship_type as inverse', 'inverse.id', 'type.inverseId')
      .innerJoin('person', 'person.id', 'person_relationship.counterpartId')
      .leftJoin('person_relationship_order as ordering', (join) =>
        join.onRef('ordering.relatedPersonId', '=', 'person.id').on('ordering.personId', '=', personId),
      )
      .select([
        'person_relationship.id',
        'person.id as personId',
        'person.name',
        'person.thumbnailPath',
        'type.id as typeId',
        'type.name as typeName',
        'type.sortRank as sortRank',
        'inverse.id as inverseId',
        'inverse.name as inverseName',
        'ordering.sortOrder as sortOrder',
      ])
      .where('person_relationship.subjectId', '=', personId);

    const asCounterpart = this.db
      .selectFrom('person_relationship')
      .innerJoin('relationship_type as type', 'type.id', 'person_relationship.typeId')
      .innerJoin('relationship_type as inverse', 'inverse.id', 'type.inverseId')
      .innerJoin('person', 'person.id', 'person_relationship.subjectId')
      .leftJoin('person_relationship_order as ordering', (join) =>
        join.onRef('ordering.relatedPersonId', '=', 'person.id').on('ordering.personId', '=', personId),
      )
      .select([
        'person_relationship.id',
        'person.id as personId',
        'person.name',
        'person.thumbnailPath',
        // Read from the far end, so the label is the inverse and its own inverse is the stored type.
        'inverse.id as typeId',
        'inverse.name as typeName',
        // The rank follows the label being shown, not the stored type.
        'inverse.sortRank as sortRank',
        'type.id as inverseId',
        'type.name as inverseName',
        'ordering.sortOrder as sortOrder',
      ])
      .where('person_relationship.counterpartId', '=', personId);

    const rows = await this.db
      .selectFrom(asSubject.unionAll(asCounterpart).as('relationship'))
      .selectAll()
      // Orders the chips within a person. The people themselves are ordered afterwards.
      .orderBy('sortRank')
      .orderBy('typeName')
      .orderBy('inverseName')
      .execute();

    const people: RelatedPerson[] = [];
    const byPersonId = new Map<string, RelatedPerson>();

    for (const row of rows) {
      let person = byPersonId.get(row.personId);
      if (!person) {
        person = {
          id: row.personId,
          name: row.name,
          thumbnailPath: row.thumbnailPath,
          // The first row for a person carries their lowest rank, because rows arrive ranked.
          familyRank: row.sortRank,
          sortOrder: row.sortOrder,
          relationships: [],
        };
        byPersonId.set(row.personId, person);
        people.push(person);
      }

      person.relationships.push({
        id: row.id,
        typeId: row.typeId,
        typeName: row.typeName,
        inverseId: row.inverseId,
        inverseName: row.inverseName,
      });
    }

    return orderRelatedPeople(people);
  }

  /**
   * Replaces the manual ordering of a person's page. The list is stored as given — position in
   * the array is the position on the page — and anyone left out loses their saved position and
   * falls back to the default rank.
   */
  async setRelatedPeopleOrder(personId: string, relatedPersonIds: string[]): Promise<void> {
    await this.db.transaction().execute(async (tx) => {
      await tx.deleteFrom('person_relationship_order').where('personId', '=', personId).execute();

      if (relatedPersonIds.length === 0) {
        return;
      }

      await tx
        .insertInto('person_relationship_order')
        .values(
          relatedPersonIds.map((relatedPersonId, sortOrder) => ({
            personId,
            relatedPersonId,
            sortOrder,
          })),
        )
        .execute();
    });
  }

  /**
   * Named, visible people ranked by how many assets they share with the subject. Everyone the
   * subject is not already linked to is returned — people sharing nothing sort last — so a picker
   * can still offer them.
   *
   * This is deliberately not the face-embedding ordering used for merge suggestions: people who
   * look alike are the least likely to be related.
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  getCoAppearances(ownerId: string, personId: string): Promise<CoAppearance[]> {
    const sharedAssets = sql<number>`count(distinct "subject_face"."assetId")::int`;

    return (
      this.db
        .selectFrom('person')
        .leftJoin('asset_face', (join) =>
          join.onRef('asset_face.personId', '=', 'person.id').on('asset_face.deletedAt', 'is', null),
        )
        .leftJoin('asset', (join) =>
          join.onRef('asset.id', '=', 'asset_face.assetId').on('asset.deletedAt', 'is', null),
        )
        .leftJoin('asset_face as subject_face', (join) =>
          join
            .onRef('subject_face.assetId', '=', 'asset.id')
            .on('subject_face.personId', '=', personId)
            .on('subject_face.deletedAt', 'is', null),
        )
        .select(['person.id', 'person.name', 'person.thumbnailPath'])
        .select(sharedAssets.as('sharedAssets'))
        .where('person.ownerId', '=', ownerId)
        .where('person.id', '!=', personId)
        .where('person.isHidden', '=', false)
        .where('person.name', '!=', '')
        // Already-linked people are left out: this picker only starts a new relationship, and a
        // further label for an existing counterpart is added from that counterpart's own row.
        .where((eb) =>
          eb.not(
            eb.exists(
              eb
                .selectFrom('person_relationship')
                .select(sql`1`.as('linked'))
                .where((inner) =>
                  inner.or([
                    inner.and([
                      inner('person_relationship.subjectId', '=', personId),
                      inner('person_relationship.counterpartId', '=', inner.ref('person.id')),
                    ]),
                    inner.and([
                      inner('person_relationship.counterpartId', '=', personId),
                      inner('person_relationship.subjectId', '=', inner.ref('person.id')),
                    ]),
                  ]),
                ),
            ),
          ),
        )
        .groupBy('person.id')
        .orderBy(sharedAssets, 'desc')
        .orderBy('person.name')
        .execute()
    );
  }
}

/**
 * Identifies the fact a row records, independently of which end it is stored from. The same fact
 * written the other way round is `(counterpart, subject, inverse)`, so the smaller of the two
 * spellings is used for both. A row with no inverse is broken and only matches itself.
 */
const factKey = (subjectId: string, counterpartId: string, typeId: string, inverseId: string | null): string => {
  const direct = `${subjectId}/${counterpartId}/${typeId}`;
  if (!inverseId) {
    return direct;
  }

  const mirrored = `${counterpartId}/${subjectId}/${inverseId}`;
  const [first] = [direct, mirrored].toSorted();
  return first;
};

/**
 * The range a pair starts with when the caller does not state one. Taken from whichever half has
 * a known name, so recreating "Godparent"/"Child" still picks up the child expectation.
 */
const derivedAgeGap = (name: string, inverseName?: string | null): AgeGap => {
  const fromName = ageGapForName(name);
  if (fromName.minAgeGap !== null) {
    return fromName;
  }

  return invertAgeGap(ageGapForName(inverseName ?? name));
};

const createTypePair = async (
  tx: Transaction<DB>,
  {
    ownerId,
    name,
    inverseName,
    ageGap,
  }: { ownerId: string; name: string; inverseName?: string | null; ageGap?: AgeGap },
): Promise<RelationshipTypePair> => {
  const isSymmetric = !inverseName || inverseName === name;
  const requested = ageGap ?? derivedAgeGap(name, inverseName);
  // A symmetric type is read from both ends at once, so only a range that equals its own
  // negation can be true of both.
  const gap = isSymmetric ? symmetricAgeGap(requested) : requested;

  const type = await tx
    .insertInto('relationship_type')
    .values({ ownerId, name, sortRank: sortRankForName(name), gender: genderForName(name), ...gap })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  if (isSymmetric) {
    await tx.updateTable('relationship_type').set({ inverseId: type.id }).where('id', '=', type.id).execute();

    return { id: type.id, name, inverseId: type.id, inverseName: name, ...gap };
  }

  const inverse = await tx
    .insertInto('relationship_type')
    .values({
      ownerId,
      name: inverseName,
      sortRank: sortRankForName(inverseName),
      gender: genderForName(inverseName),
      ...invertAgeGap(gap),
    })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  await tx.updateTable('relationship_type').set({ inverseId: inverse.id }).where('id', '=', type.id).execute();
  await tx.updateTable('relationship_type').set({ inverseId: type.id }).where('id', '=', inverse.id).execute();

  return { id: type.id, name, inverseId: inverse.id, inverseName, ...gap };
};
