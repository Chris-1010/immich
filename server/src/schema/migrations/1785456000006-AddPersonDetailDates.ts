import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "person_detail" ADD "since" date;`.execute(db);
  await sql`ALTER TABLE "person_detail" ADD "sincePrecision" character varying;`.execute(db);
  await sql`ALTER TABLE "person_detail" ADD "until" date;`.execute(db);
  await sql`ALTER TABLE "person_detail" ADD "untilPrecision" character varying;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "person_detail" DROP COLUMN "untilPrecision";`.execute(db);
  await sql`ALTER TABLE "person_detail" DROP COLUMN "until";`.execute(db);
  await sql`ALTER TABLE "person_detail" DROP COLUMN "sincePrecision";`.execute(db);
  await sql`ALTER TABLE "person_detail" DROP COLUMN "since";`.execute(db);
}
