import { PersonTable } from 'src/schema/tables/person.table';
import { Column, CreateDateColumn, ForeignKeyColumn, Generated, Table, Timestamp } from 'src/sql-tools';

/**
 * Where one person sits in the list on another person's relationships page, once the owner has
 * dragged the list into an order they want.
 *
 * The position belongs to the page it was arranged on, not to the relationship: a relationship is
 * stored once and read from both ends, so putting Bob at the top of Alice's page must say nothing
 * about where Alice sits on Bob's. Hence a row per direction, keyed by the page it orders.
 *
 * Only people present when the order was saved have a row. Anyone related since is placed by the
 * default rank instead, so this table is sparse by design.
 */
@Table('person_relationship_order')
export class PersonRelationshipOrderTable {
  /** The person whose page this ordering belongs to. */
  @ForeignKeyColumn(() => PersonTable, {
    onUpdate: 'CASCADE',
    onDelete: 'CASCADE',
    primary: true,
    // the primary key already leads with this column
    index: false,
  })
  personId!: string;

  @ForeignKeyColumn(() => PersonTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', primary: true })
  relatedPersonId!: string;

  @Column({ type: 'integer' })
  sortOrder!: number;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;
}
