import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { UserTable } from 'src/schema/tables/user.table';
import { DEFAULT_SORT_RANK } from 'src/utils/relationship';
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
