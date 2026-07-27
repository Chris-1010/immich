import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "relationship_type" ADD "gender" character varying;`.execute(db);
  // Types seeded before this column existed get the gender their name would have been seeded with.
  // Anything else states nothing, which is what an unrecognised name gets.
  await sql`UPDATE "relationship_type" SET "gender" = CASE "name"
  WHEN 'Father' THEN 'male'
  WHEN 'Mother' THEN 'female'
  WHEN 'Son' THEN 'male'
  WHEN 'Daughter' THEN 'female'
  WHEN 'Brother' THEN 'male'
  WHEN 'Sister' THEN 'female'
  WHEN 'Grandfather' THEN 'male'
  WHEN 'Grandmother' THEN 'female'
  WHEN 'Grandson' THEN 'male'
  WHEN 'Granddaughter' THEN 'female'
  WHEN 'Uncle' THEN 'male'
  WHEN 'Aunt' THEN 'female'
  WHEN 'Nephew' THEN 'male'
  WHEN 'Niece' THEN 'female'
  WHEN 'Husband' THEN 'male'
  WHEN 'Wife' THEN 'female'
  WHEN 'Godfather' THEN 'male'
  WHEN 'Godmother' THEN 'female'
  WHEN 'Godson' THEN 'male'
  WHEN 'Goddaughter' THEN 'female'
  WHEN 'Stepfather' THEN 'male'
  WHEN 'Stepmother' THEN 'female'
  WHEN 'Stepson' THEN 'male'
  WHEN 'Stepdaughter' THEN 'female'
  WHEN 'Stepbrother' THEN 'male'
  WHEN 'Stepsister' THEN 'female'
END;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "relationship_type" DROP COLUMN "gender";`.execute(db);
}
