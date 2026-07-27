import {
  CompiledQuery,
  DatabaseConnection,
  Driver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  QueryResult,
} from 'kysely';
import { canonicalOrder, RelationshipRepository } from 'src/repositories/relationship.repository';
import { DB } from 'src/schema';

type Rows = Record<string, unknown>[];

/**
 * A connection that never talks to a database: it records every statement and answers each one
 * from a queue of prepared result sets. Enough to exercise the TypeScript half of a repository
 * method — which rows it moves, drops and groups — without a Postgres instance.
 */
class RecordingConnection implements DatabaseConnection {
  constructor(
    readonly statements: CompiledQuery[],
    private readonly results: Rows[],
  ) {}

  executeQuery<R>(compiledQuery: CompiledQuery): Promise<QueryResult<R>> {
    this.statements.push(compiledQuery);
    return Promise.resolve({ rows: (this.results.shift() ?? []) as R[] });
  }

  streamQuery<R>(): AsyncIterableIterator<QueryResult<R>> {
    throw new Error('streaming is not supported by the recording connection');
  }
}

const noop = () => Promise.resolve();

class RecordingDriver implements Driver {
  constructor(private readonly connection: RecordingConnection) {}

  init = noop;
  acquireConnection = (): Promise<DatabaseConnection> => Promise.resolve(this.connection);
  beginTransaction = noop;
  commitTransaction = noop;
  rollbackTransaction = noop;
  releaseConnection = noop;
  destroy = noop;
}

const newRepository = (results: Rows[] = []) => {
  const statements: CompiledQuery[] = [];
  const connection = new RecordingConnection(statements, results);
  const db = new Kysely<DB>({
    dialect: {
      createAdapter: () => new PostgresAdapter(),
      createDriver: () => new RecordingDriver(connection),
      createIntrospector: (db) => new PostgresIntrospector(db),
      createQueryCompiler: () => new PostgresQueryCompiler(),
    },
  });

  return { sut: new RelationshipRepository(db), statements };
};

/** Every write a reassignment made, in order, as `[verb, parameters]` pairs. */
const writes = (statements: CompiledQuery[]) =>
  statements.slice(1).map((statement) => [statement.sql.split(' ')[0], statement.parameters] as const);

const sibling = { id: 'type-sibling', inverseId: 'type-sibling' };
const parent = { id: 'type-parent', inverseId: 'type-child' };

describe(canonicalOrder.name, () => {
  it('should store a symmetric relationship with the smaller person id as the subject', () => {
    expect(canonicalOrder(sibling, 'person-b', 'person-a')).toEqual({
      subjectId: 'person-a',
      counterpartId: 'person-b',
    });
  });

  it('should leave a symmetric relationship that is already in canonical order alone', () => {
    expect(canonicalOrder(sibling, 'person-a', 'person-b')).toEqual({
      subjectId: 'person-a',
      counterpartId: 'person-b',
    });
  });

  it('should give the same row whichever end a symmetric relationship is added from', () => {
    expect(canonicalOrder(sibling, 'person-a', 'person-b')).toEqual(canonicalOrder(sibling, 'person-b', 'person-a'));
  });

  it('should store an asymmetric relationship exactly as entered', () => {
    expect(canonicalOrder(parent, 'person-b', 'person-a')).toEqual({
      subjectId: 'person-b',
      counterpartId: 'person-a',
    });
    expect(canonicalOrder(parent, 'person-a', 'person-b')).toEqual({
      subjectId: 'person-a',
      counterpartId: 'person-b',
    });
  });
});

describe(RelationshipRepository.name, () => {
  describe('create', () => {
    it('should skip the insert when the relationship already exists', async () => {
      const { sut, statements } = newRepository();

      await sut.create({
        ownerId: 'owner-1',
        subjectId: 'person-a',
        counterpartId: 'person-b',
        typeId: 'type-sibling',
      });

      expect(statements[0].sql).toContain('on conflict ("subjectId", "counterpartId", "typeId") do nothing');
    });
  });

  describe('deleteTypePair', () => {
    it('should delete the type and whatever names it as an inverse', async () => {
      const { sut, statements } = newRepository();

      await sut.deleteTypePair('type-parent');

      expect(statements).toHaveLength(1);
      expect(statements[0].sql).toContain('"id" = $1 or "inverseId" = $2');
      expect(statements[0].parameters).toEqual(['type-parent', 'type-parent']);
    });
  });

  describe('getRelatedPeople', () => {
    it('should read the label as the inverse when the person is the counterpart', async () => {
      const { sut, statements } = newRepository([[]]);

      await sut.getRelatedPeople('person-a');

      const [asSubject, asCounterpart] = statements[0].sql.split('union all');
      // Read from their own end the label is the type; read from the far end it is the inverse.
      expect(asSubject).toContain('"type"."id" as "typeId"');
      expect(asSubject).toContain('"inverse"."id" as "inverseId"');
      expect(asCounterpart).toContain('"inverse"."id" as "typeId"');
      expect(asCounterpart).toContain('"type"."id" as "inverseId"');
    });

    it('should group every label under the person it describes', async () => {
      const { sut } = newRepository([
        [
          {
            id: 'relationship-1',
            personId: 'person-b',
            name: 'Bob',
            thumbnailPath: '/bob.jpg',
            typeId: 'type-parent',
            typeName: 'Parent',
            sortRank: 10,
            inverseId: 'type-child',
            inverseName: 'Child',
            sortOrder: null,
          },
          {
            id: 'relationship-2',
            personId: 'person-b',
            name: 'Bob',
            thumbnailPath: '/bob.jpg',
            typeId: 'type-work',
            typeName: 'Work',
            sortRank: 1000,
            inverseId: 'type-work',
            inverseName: 'Work',
            sortOrder: null,
          },
          {
            id: 'relationship-3',
            personId: 'person-c',
            name: 'Carol',
            thumbnailPath: '/carol.jpg',
            typeId: 'type-sibling',
            typeName: 'Sibling',
            sortRank: 30,
            inverseId: 'type-sibling',
            inverseName: 'Sibling',
            sortOrder: null,
          },
        ],
      ]);

      await expect(sut.getRelatedPeople('person-a')).resolves.toEqual([
        {
          id: 'person-b',
          name: 'Bob',
          thumbnailPath: '/bob.jpg',
          // Bob's best rank is the parent chip, so he outranks Carol despite sorting after her.
          familyRank: 10,
          sortOrder: null,
          relationships: [
            {
              id: 'relationship-1',
              typeId: 'type-parent',
              typeName: 'Parent',
              inverseId: 'type-child',
              inverseName: 'Child',
            },
            {
              id: 'relationship-2',
              typeId: 'type-work',
              typeName: 'Work',
              inverseId: 'type-work',
              inverseName: 'Work',
            },
          ],
        },
        {
          id: 'person-c',
          name: 'Carol',
          thumbnailPath: '/carol.jpg',
          familyRank: 30,
          sortOrder: null,
          relationships: [
            {
              id: 'relationship-3',
              typeId: 'type-sibling',
              typeName: 'Sibling',
              inverseId: 'type-sibling',
              inverseName: 'Sibling',
            },
          ],
        },
      ]);
    });

    it('should list the people in the order they were dragged into', async () => {
      const row = (personId: string, name: string, sortRank: number, sortOrder: number | null) => ({
        id: `relationship-${personId}`,
        personId,
        name,
        thumbnailPath: `/${name}.jpg`,
        typeId: 'type-x',
        typeName: 'X',
        sortRank,
        inverseId: 'type-x',
        inverseName: 'X',
        sortOrder,
      });

      // Carol is family and Bob is not, so the default order would be the other way round.
      const { sut } = newRepository([[row('person-b', 'Bob', 1000, 0), row('person-c', 'Carol', 10, 1)]]);

      const people = await sut.getRelatedPeople('person-a');

      expect(people.map(({ name }) => name)).toEqual(['Bob', 'Carol']);
    });
  });

  describe('setRelatedPeopleOrder', () => {
    it('should replace the whole ordering of the page', async () => {
      const { sut, statements } = newRepository();

      await sut.setRelatedPeopleOrder('person-a', ['person-c', 'person-b']);

      const [remove, insert] = statements.map((statement) => [statement.sql.split(' ')[0], statement.parameters]);
      // The old order goes first, so anyone dropped from the list stops having a saved position.
      expect(remove).toEqual(['delete', ['person-a']]);
      // Position in the list is the stored order.
      expect(insert).toEqual(['insert', ['person-a', 'person-c', 0, 'person-a', 'person-b', 1]]);
    });

    it('should only clear when the list is empty', async () => {
      const { sut, statements } = newRepository();

      await sut.setRelatedPeopleOrder('person-a', []);

      expect(statements).toHaveLength(1);
      expect(statements[0].sql.split(' ')[0]).toEqual('delete');
    });
  });

  describe('getCoAppearances', () => {
    it('should exclude people already linked to the subject from either end', async () => {
      const { sut, statements } = newRepository([[]]);

      await sut.getCoAppearances('owner-1', 'person-a');

      const [, exclusion] = statements[0].sql.split('not exists');
      expect(exclusion).toContain('"person_relationship"');
      // Both directions, because a relationship is stored once and read from both ends.
      expect(exclusion).toContain('"person_relationship"."subjectId" = $');
      expect(exclusion).toContain('"person_relationship"."counterpartId" = $');
      expect(exclusion).toContain('"person"."id"');
    });
  });

  describe('reassignRelationships', () => {
    it('should move the merged person onto the surviving person', async () => {
      const { sut, statements } = newRepository([
        [
          {
            id: 'relationship-1',
            subjectId: 'person-old',
            counterpartId: 'person-c',
            typeId: 'type-parent',
            inverseId: 'type-child',
          },
        ],
      ]);

      await sut.reassignRelationships('person-old', 'person-new');

      expect(writes(statements)).toEqual([['update', ['person-new', 'person-c', 'relationship-1']]]);
    });

    it('should re-canonicalise a symmetric relationship it moves', async () => {
      const { sut, statements } = newRepository([
        [
          {
            id: 'relationship-1',
            // Canonical before the merge, since 'person-a' sorts before 'person-old'.
            subjectId: 'person-a',
            counterpartId: 'person-old',
            typeId: 'type-sibling',
            inverseId: 'type-sibling',
          },
        ],
      ]);

      await sut.reassignRelationships('person-old', 'person-0');

      // 'person-0' sorts before 'person-a', so the moved row has to swap ends.
      expect(writes(statements)).toEqual([['update', ['person-0', 'person-a', 'relationship-1']]]);
    });

    it('should drop a relationship between the two people being merged', async () => {
      const { sut, statements } = newRepository([
        [
          {
            id: 'relationship-1',
            subjectId: 'person-new',
            counterpartId: 'person-old',
            typeId: 'type-sibling',
            inverseId: 'type-sibling',
          },
        ],
      ]);

      await sut.reassignRelationships('person-old', 'person-new');

      expect(writes(statements)).toEqual([['delete', ['relationship-1']]]);
    });

    it('should drop a moved relationship the surviving person already records', async () => {
      const { sut, statements } = newRepository([
        [
          {
            id: 'relationship-kept',
            subjectId: 'person-new',
            counterpartId: 'person-c',
            typeId: 'type-parent',
            inverseId: 'type-child',
          },
          {
            id: 'relationship-moved',
            subjectId: 'person-old',
            counterpartId: 'person-c',
            typeId: 'type-parent',
            inverseId: 'type-child',
          },
        ],
      ]);

      await sut.reassignRelationships('person-old', 'person-new');

      expect(writes(statements)).toEqual([['delete', ['relationship-moved']]]);
    });

    it('should drop a moved relationship the surviving person already records from the other end', async () => {
      const { sut, statements } = newRepository([
        [
          {
            // Carol is already recorded as person-new's child.
            id: 'relationship-kept',
            subjectId: 'person-new',
            counterpartId: 'person-c',
            typeId: 'type-child',
            inverseId: 'type-parent',
          },
          {
            // The merged person records the same fact the other way round.
            id: 'relationship-moved',
            subjectId: 'person-c',
            counterpartId: 'person-old',
            typeId: 'type-parent',
            inverseId: 'type-child',
          },
        ],
      ]);

      await sut.reassignRelationships('person-old', 'person-new');

      expect(writes(statements)).toEqual([['delete', ['relationship-moved']]]);
    });

    it('should keep two moved relationships that record different facts', async () => {
      const { sut, statements } = newRepository([
        [
          {
            id: 'relationship-1',
            subjectId: 'person-old',
            counterpartId: 'person-c',
            typeId: 'type-parent',
            inverseId: 'type-child',
          },
          {
            id: 'relationship-2',
            subjectId: 'person-old',
            counterpartId: 'person-d',
            typeId: 'type-parent',
            inverseId: 'type-child',
          },
        ],
      ]);

      await sut.reassignRelationships('person-old', 'person-new');

      expect(writes(statements)).toEqual([
        ['update', ['person-new', 'person-c', 'relationship-1']],
        ['update', ['person-new', 'person-d', 'relationship-2']],
      ]);
    });

    it('should leave relationships that touch neither person alone', async () => {
      const { sut, statements } = newRepository([[]]);

      await sut.reassignRelationships('person-old', 'person-new');

      expect(writes(statements)).toEqual([]);
    });
  });
});
