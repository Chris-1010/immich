import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { PersonDetailDatePrecision, PersonDetailKind } from 'src/enum';
import { PersonTable } from 'src/schema/tables/person.table';
import { UserTable } from 'src/schema/tables/user.table';
import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Index,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  UpdateDateColumn,
} from 'src/sql-tools';

/**
 * One free-text fact recorded against a person: a key and a value, such as "Hometown" and "Cork".
 *
 * The key is stored as text rather than pointing at a vocabulary table, because the set of things
 * worth recording about a person is not knowable in advance. Autocomplete reads the keys already
 * in the library instead, and a key typed in different casing is snapped to the casing already in
 * use, so a free-text column still behaves like a shared vocabulary in practice.
 *
 * Nothing is unique here. The same key twice on one person is a legitimate thing to record — two
 * addresses, two schools — so duplicates are the caller's business, not the schema's.
 */
@Table('person_detail')
@UpdatedAtTrigger('person_detail_updatedAt')
// Both autocomplete and the "along with" column group by the lowercased key, and along-with by the
// lowercased value under it, so the indexes have to be on the lowered expressions rather than the
// stored text — otherwise every lookup falls back to a sequential scan over the whole library.
// Declared as a single expression because a mixed column-and-expression index cannot be written as
// separate `columns` and `expression` options.
@Index({ name: 'person_detail_owner_key_idx', expression: `"ownerId", lower("key")` })
@Index({ name: 'person_detail_owner_key_value_idx', expression: `"ownerId", lower("key"), lower("value")` })
// Kind rows match each other on kind and value rather than key text, so along-with and per-kind
// value suggestions need their own index. Partial, because free-text rows are the bulk of the table
// and never look anything up by kind.
@Index({
  name: 'person_detail_owner_kind_value_idx',
  expression: `"ownerId", "kind", lower("value")`,
  where: `(kind IS NOT NULL)`,
})
// The pinned Home and Work rows the location picker offers as people's places. Few rows in a
// large table, which is the case a partial index is for.
@Index({ name: 'person_detail_owner_pinned_idx', columns: ['ownerId'], where: `(latitude IS NOT NULL)` })
export class PersonDetailTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  ownerId!: string;

  @ForeignKeyColumn(() => PersonTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  personId!: string;

  /**
   * The detail this one qualifies, or null for a detail that stands on its own.
   *
   * A subdetail is a fact about its parent rather than about the person: "Class of" and "2016" say
   * nothing until read under the school they hang from, which is why they are kept off the person's
   * page and why they only ever match between two people who already share that parent pair.
   *
   * One level deep by construction. Nothing enforces that here, since a check constraint would have
   * to read the parent row, so the writers are what keep it flat — every one of them refuses a
   * parent that has a parent of its own.
   */
  @ForeignKeyColumn(() => PersonDetailTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', nullable: true })
  parentId!: string | null;

  @Column()
  key!: string;

  @Column()
  value!: string;

  /** Position in the list on the person's page. Assigned from the array order on every save. */
  /**
   * The contact field this row is — Work, Home, Email or Phone — or null for a free-text detail.
   * A kind row is otherwise a normal detail: it has a key (the kind's name as the owner saw it), a
   * value, dates, subdetails and an along-with group. Subdetails never carry one.
   */
  @Column({ nullable: true })
  kind!: PersonDetailKind | null;

  /**
   * Where a Home or Work row is, if the owner set a pin. Both or neither, and only on those two
   * kinds: an email address has no place on a map. The writers enforce both, not the schema.
   */
  @Column({ type: 'double precision', nullable: true })
  latitude!: number | null;

  @Column({ type: 'double precision', nullable: true })
  longitude!: number | null;

  @Column({ type: 'integer', default: 0 })
  sortOrder!: Generated<number>;

  /**
   * When the fact became true, if known. Stored snapped to the first day of its year or month, with
   * `sincePrecision` saying which, so a year-only date is never mistaken for one on 1 January.
   *
   * Only top-level details carry dates: a subdetail lives and dies with its parent row.
   */
  @Column({ type: 'date', nullable: true })
  since!: Timestamp | null;

  @Column({ nullable: true })
  sincePrecision!: PersonDetailDatePrecision | null;

  /**
   * When the fact stopped being true. Null is what makes a detail Current; any date makes it Past.
   * There is no separate status column, so the two can never disagree.
   */
  @Column({ type: 'date', nullable: true })
  until!: Timestamp | null;

  @Column({ nullable: true })
  untilPrecision!: PersonDetailDatePrecision | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
