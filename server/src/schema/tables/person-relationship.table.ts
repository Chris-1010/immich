import { PersonTable } from 'src/schema/tables/person.table';
import { RelationshipTypeTable } from 'src/schema/tables/relationship-type.table';
import { UserTable } from 'src/schema/tables/user.table';
import {
  Check,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  PrimaryGeneratedColumn,
  Table,
  Timestamp,
  Unique,
} from 'src/sql-tools';

@Table('person_relationship')
@Unique({ columns: ['subjectId', 'counterpartId', 'typeId'] })
@Check({ name: 'person_relationship_no_self_chk', expression: `"subjectId" <> "counterpartId"` })
export class PersonRelationshipTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  ownerId!: string;

  @ForeignKeyColumn(() => PersonTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  subjectId!: string;

  @ForeignKeyColumn(() => PersonTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  counterpartId!: string;

  // The type describes the counterpart: "Bob — Parent" on Alice's page means Bob is Alice's parent.
  @ForeignKeyColumn(() => RelationshipTypeTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  typeId!: string;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
