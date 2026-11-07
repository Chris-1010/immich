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
  UpdateDateColumn,
} from 'src/sql-tools';

/**
 * A named pin the owner saved in the location picker, such as "Gran's house", so it can be found
 * again by name instead of by panning the map.
 *
 * Nothing is unique here. Two pins can share a name and two names can share a pin; the only
 * deduplication is the one-off import from browser storage, which skips an exact name and
 * coordinate match so running it twice changes nothing.
 */
@Table('saved_location')
@UpdatedAtTrigger('saved_location_updatedAt')
export class SavedLocationTable {
  @PrimaryGeneratedColumn()
  id!: Generated<string>;

  @ForeignKeyColumn(() => UserTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE' })
  ownerId!: string;

  @Column()
  name!: string;

  @Column({ type: 'double precision' })
  latitude!: number;

  @Column({ type: 'double precision' })
  longitude!: number;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @UpdateIdColumn({ index: true })
  updateId!: Generated<string>;
}
