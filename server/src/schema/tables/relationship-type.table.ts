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
