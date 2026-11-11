import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TYPE "asset_visibility_enum" ADD VALUE IF NOT EXISTS 'review';`.execute(db);
  await sql`CREATE TABLE "asset_review" (
  "assetId" uuid NOT NULL,
  "decision" character varying NOT NULL DEFAULT 'undecided',
  "edits" jsonb NOT NULL DEFAULT '{}',
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "asset_review_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "asset" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "asset_review_pkey" PRIMARY KEY ("assetId")
);`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "asset_review_updatedAt"
  BEFORE UPDATE ON "asset_review"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // Postgres cannot drop a value from an enum, so 'review' stays on asset_visibility_enum.
  await sql`DROP TABLE "asset_review";`.execute(db);
}
