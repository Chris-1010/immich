import { UpdatedAtTrigger, UpdateIdColumn } from 'src/decorators';
import { ReviewDecision } from 'src/enum';
import { AssetTable } from 'src/schema/tables/asset.table';
import {
  Column,
  CreateDateColumn,
  ForeignKeyColumn,
  Generated,
  Table,
  Timestamp,
  UpdateDateColumn,
} from 'src/sql-tools';
import type { ReviewEdits } from 'src/types';

/**
 * The review state of a pending asset: the user's decision so far and the edits staged against it.
 * One row per asset in the `review` visibility; the row is removed when the review is finished.
 */
@Table('asset_review')
@UpdatedAtTrigger('asset_review_updatedAt')
export class AssetReviewTable {
  @ForeignKeyColumn(() => AssetTable, { onUpdate: 'CASCADE', onDelete: 'CASCADE', primary: true })
  assetId!: string;

  @Column({ type: 'character varying', default: ReviewDecision.Undecided })
  decision!: Generated<ReviewDecision>;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  edits!: Generated<ReviewEdits>;

  @CreateDateColumn()
  createdAt!: Generated<Timestamp>;

  @UpdateDateColumn()
  updatedAt!: Generated<Timestamp>;

  @UpdateIdColumn()
  updateId!: Generated<string>;
}
