import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "person_detail" ADD "kind" character varying;`.execute(db);
  await sql`ALTER TABLE "person_detail" ADD "latitude" double precision;`.execute(db);
  await sql`ALTER TABLE "person_detail" ADD "longitude" double precision;`.execute(db);
  await sql`CREATE INDEX "person_detail_owner_kind_value_idx" ON "person_detail" ("ownerId", "kind", lower("value")) WHERE "kind" IS NOT NULL;`.execute(
    db,
  );
  await sql`CREATE INDEX "person_detail_owner_pinned_idx" ON "person_detail" ("ownerId") WHERE "latitude" IS NOT NULL;`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "person_detail_owner_pinned_idx";`.execute(db);
  await sql`DROP INDEX "person_detail_owner_kind_value_idx";`.execute(db);
  await sql`ALTER TABLE "person_detail" DROP COLUMN "longitude";`.execute(db);
  await sql`ALTER TABLE "person_detail" DROP COLUMN "latitude";`.execute(db);
  await sql`ALTER TABLE "person_detail" DROP COLUMN "kind";`.execute(db);
}
