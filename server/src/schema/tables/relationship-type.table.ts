import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { UserTable } from 'src/schema/tables/user.table';
import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  Unique,
  UpdateDateColumn,
} from 'src/sql-tools';
import { DEFAULT_SORT_RANK, RelationshipGender } from 'src/utils/relationship';

@Table('relationship_type')
@UpdatedAtTrigger('relationship_type_updatedAt')
// Names are not unique: "Uncle" exists once paired with "Nephew" and again paired with "Niece",
// so a type is only identified by its name together with its inverse.
@Unique({ columns: ['ownerId', 'name', 'inverseId'] })
export class RelationshipTypeTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    // [ownerId, name, inverseId] makes this redundant
    index: false,
  })
  ownerId!: string;

  @Column()
  name!: string;

  // Where the type sorts on a person's page before anyone has dragged anything: close family
  // first, in the order a family tree is usually read. Everything else shares the default rank
  // and falls back to sorting by name.
  @Column({ type: 'integer', default: DEFAULT_SORT_RANK })
  sortRank!: Generated<number>;

  // How much older the counterpart is expected to be than the subject, in signed years: a type
  // describes the counterpart, so "Parent" holds a positive range and "Child" the negative of it.
  // Both bounds are set together or not at all — no range means age says nothing about the type,
  // which is not the same as a range the two people happen to fall outside of. Only used to order
  // the type picker, never to reject a relationship the owner asks for.
  @Column({ type: 'integer', nullable: true })
  minAgeGap!: number | null;

  @Column({ type: 'integer', nullable: true })
  maxAgeGap!: number | null;

  // The gender the type states about the person it describes, taken from its name: "Nephew" can
  // only name a man. Null means the name states nothing, which is not the same as stating that
  // either gender fits — it is simply unknown. Both halves carry their own, since Uncle / Niece
  // names a man at one end and a woman at the other.
  @Column({ nullable: true })
  gender!: RelationshipGender | null;

  // Nullable only so the first half of a pair can be inserted before the second one exists;
  // both halves are wired up in the same transaction. A type pointing at itself is symmetric.
  @ForeignKeyColumn(() => RelationshipTypeTable, { nullable: true, onDelete: 'CASCADE' })
  inverseId!: string | null;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
