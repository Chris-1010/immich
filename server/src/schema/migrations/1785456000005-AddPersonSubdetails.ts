import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "person_detail" ADD "parentId" uuid;`.execute(db);
  await sql`ALTER TABLE "person_detail" ADD CONSTRAINT "person_detail_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "person_detail" ("id") ON UPDATE CASCADE ON DELETE CASCADE;`.execute(
    db,
  );
  await sql`CREATE INDEX "person_detail_parentId_idx" ON "person_detail" ("parentId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX "person_detail_parentId_idx";`.execute(db);
  await sql`ALTER TABLE "person_detail" DROP CONSTRAINT "person_detail_parentId_fkey";`.execute(db);
  await sql`ALTER TABLE "person_detail" DROP COLUMN "parentId";`.execute(db);
}
