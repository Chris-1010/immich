import { Injectable } from '@nestjs/common';
import { Kysely, Transaction } from 'kysely';
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
