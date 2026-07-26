import { Injectable } from '@nestjs/common';
import { Kysely, sql, Transaction } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { DB } from 'src/schema';

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

export interface RelationshipTypePair {
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
export interface RelatedPerson {
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
        'inverse.id as inverseId',
        'inverse.name as inverseName',
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
  createTypePair({ ownerId, name, inverseName }: { ownerId: string; name: string; inverseName?: string | null }) {
    return this.db.transaction().execute((tx) => createTypePair(tx, { ownerId, name, inverseName }));
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

  /** Renames a single half of a pair. The other half is renamed by a second call. */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.STRING] })
  async renameType(id: string, name: string): Promise<void> {
    await this.db.updateTable('relationship_type').set({ name }).where('id', '=', id).execute();
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
   * Every counterpart of a person, grouped, with the labels read from that person's end: rows
   * where they are the subject carry the type itself, rows where they are the counterpart carry
   * its inverse. This is also the shape a Venn diagram of a person's types needs.
   */
  @GenerateSql({ params: [DummyValue.UUID] })
  async getRelatedPeople(personId: string): Promise<RelatedPerson[]> {
    const asSubject = this.db
      .selectFrom('person_relationship')
      .innerJoin('relationship_type as type', 'type.id', 'person_relationship.typeId')
      .innerJoin('relationship_type as inverse', 'inverse.id', 'type.inverseId')
      .innerJoin('person', 'person.id', 'person_relationship.counterpartId')
      .select([
        'person_relationship.id',
        'person.id as personId',
        'person.name',
        'person.thumbnailPath',
        'type.id as typeId',
        'type.name as typeName',
        'inverse.id as inverseId',
        'inverse.name as inverseName',
      ])
      .where('person_relationship.subjectId', '=', personId);

    const asCounterpart = this.db
      .selectFrom('person_relationship')
      .innerJoin('relationship_type as type', 'type.id', 'person_relationship.typeId')
      .innerJoin('relationship_type as inverse', 'inverse.id', 'type.inverseId')
      .innerJoin('person', 'person.id', 'person_relationship.subjectId')
      .select([
        'person_relationship.id',
        'person.id as personId',
        'person.name',
        'person.thumbnailPath',
        // Read from the far end, so the label is the inverse and its own inverse is the stored type.
        'inverse.id as typeId',
        'inverse.name as typeName',
        'type.id as inverseId',
        'type.name as inverseName',
      ])
      .where('person_relationship.counterpartId', '=', personId);

    const rows = await this.db
      .selectFrom(asSubject.unionAll(asCounterpart).as('relationship'))
      .selectAll()
      .orderBy('name')
      .orderBy('typeName')
      .orderBy('inverseName')
      .execute();

    const people: RelatedPerson[] = [];
    const byPersonId = new Map<string, RelatedPerson>();

    for (const row of rows) {
      let person = byPersonId.get(row.personId);
      if (!person) {
        person = { id: row.personId, name: row.name, thumbnailPath: row.thumbnailPath, relationships: [] };
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

    return people;
  }

  /**
   * Named, visible people ranked by how many assets they share with the subject. Everyone is
   * returned — people sharing nothing sort last — so a picker can still offer them.
   *
   * This is deliberately not the face-embedding ordering used for merge suggestions: people who
   * look alike are the least likely to be related.
   */
  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  getCoAppearances(ownerId: string, personId: string): Promise<CoAppearance[]> {
    const sharedAssets = sql<number>`count(distinct "subject_face"."assetId")::int`;

    return this.db
      .selectFrom('person')
      .leftJoin('asset_face', (join) =>
        join.onRef('asset_face.personId', '=', 'person.id').on('asset_face.deletedAt', 'is', null),
      )
      .leftJoin('asset', (join) => join.onRef('asset.id', '=', 'asset_face.assetId').on('asset.deletedAt', 'is', null))
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
      .groupBy('person.id')
      .orderBy(sharedAssets, 'desc')
      .orderBy('person.name')
      .execute();
  }
}

const createTypePair = async (
  tx: Transaction<DB>,
  { ownerId, name, inverseName }: { ownerId: string; name: string; inverseName?: string | null },
): Promise<RelationshipTypePair> => {
  const type = await tx
    .insertInto('relationship_type')
    .values({ ownerId, name })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  const isSymmetric = !inverseName || inverseName === name;
  if (isSymmetric) {
    await tx.updateTable('relationship_type').set({ inverseId: type.id }).where('id', '=', type.id).execute();

    return { id: type.id, name, inverseId: type.id, inverseName: name };
  }

  const inverse = await tx
    .insertInto('relationship_type')
    .values({ ownerId, name: inverseName })
    .returning(['id'])
    .executeTakeFirstOrThrow();

  await tx.updateTable('relationship_type').set({ inverseId: inverse.id }).where('id', '=', type.id).execute();
  await tx.updateTable('relationship_type').set({ inverseId: type.id }).where('id', '=', inverse.id).execute();

  return { id: type.id, name, inverseId: inverse.id, inverseName };
};
