import { Injectable } from '@nestjs/common';
import { Kysely, Updateable } from 'kysely';
import { InjectKysely } from 'nestjs-kysely';
import { DummyValue, GenerateSql } from 'src/decorators';
import { AssetVisibility, ReviewDecision } from 'src/enum';
import { DB } from 'src/schema';
import { AssetReviewTable } from 'src/schema/tables/asset-review.table';
import { ReviewEdits } from 'src/types';
import { anyUuid, asUuid } from 'src/utils/database';

export interface ReviewItem {
  assetId: string;
  decision: ReviewDecision;
  edits: ReviewEdits;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class ReviewRepository {
  constructor(@InjectKysely() private db: Kysely<DB>) {}

  private items(ownerId: string) {
    return this.db
      .selectFrom('asset_review')
      .innerJoin('asset', 'asset.id', 'asset_review.assetId')
      .select([
        'asset_review.assetId',
        'asset_review.decision',
        'asset_review.edits',
        'asset_review.createdAt',
        'asset_review.updatedAt',
      ])
      .where('asset.ownerId', '=', asUuid(ownerId))
      .where('asset.visibility', '=', AssetVisibility.Review)
      .where('asset.deletedAt', 'is', null);
  }

  /** Every pending asset belonging to the owner, in the order they were added. */
  @GenerateSql({ params: [DummyValue.UUID] })
  getAll(ownerId: string): Promise<ReviewItem[]> {
    return this.items(ownerId)
      .orderBy('asset_review.createdAt', 'asc')
      .orderBy('asset_review.assetId', 'asc')
      .execute() as Promise<ReviewItem[]>;
  }

  @GenerateSql({ params: [DummyValue.UUID, DummyValue.UUID] })
  get(ownerId: string, assetId: string): Promise<ReviewItem | undefined> {
    return this.items(ownerId).where('asset_review.assetId', '=', asUuid(assetId)).executeTakeFirst() as Promise<
      ReviewItem | undefined
    >;
  }

  @GenerateSql({ params: [DummyValue.UUID] })
  async create(assetId: string): Promise<void> {
    await this.db
      .insertInto('asset_review')
      .values({ assetId })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  @GenerateSql({ params: [DummyValue.UUID, { decision: ReviewDecision.Keep }] })
  update(assetId: string, values: Updateable<AssetReviewTable>): Promise<ReviewItem> {
    return this.db
      .updateTable('asset_review')
      .set(values)
      .where('assetId', '=', asUuid(assetId))
      .returning(['assetId', 'decision', 'edits', 'createdAt', 'updatedAt'])
      .executeTakeFirstOrThrow() as Promise<ReviewItem>;
  }

  @GenerateSql({ params: [[DummyValue.UUID]] })
  async delete(assetIds: string[]): Promise<void> {
    if (assetIds.length === 0) {
      return;
    }
    await this.db.deleteFrom('asset_review').where('assetId', '=', anyUuid(assetIds)).execute();
  }

  /**
   * Re-stamp the asset's exif and face rows so the sync streams, which held them back while the
   * asset was pending, send them now that it has joined the library.
   */
  @GenerateSql({ params: [DummyValue.UUID] })
  async touchForSync(assetId: string): Promise<void> {
    await this.db
      .updateTable('asset_exif')
      .set({ updatedAt: new Date() })
      .where('assetId', '=', asUuid(assetId))
      .execute();
    await this.db
      .updateTable('asset_face')
      .set({ updatedAt: new Date() })
      .where('assetId', '=', asUuid(assetId))
      .execute();
  }
}
