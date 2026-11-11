import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // The shared updated_at() trigger stamps "updateId" as well as "updatedAt".
  await sql`ALTER TABLE "asset_review" ADD COLUMN IF NOT EXISTS "updateId" uuid NOT NULL DEFAULT immich_uuid_v7();`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "asset_review" DROP COLUMN "updateId";`.execute(db);
}
