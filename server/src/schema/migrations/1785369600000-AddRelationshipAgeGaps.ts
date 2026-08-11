import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "relationship_type" ADD "minAgeGap" integer;`.execute(db);
  await sql`ALTER TABLE "relationship_type" ADD "maxAgeGap" integer;`.execute(db);
  // Types seeded before these columns existed get the range their name would have been seeded
  // with. Anything else keeps no range, which is what an invented type gets.
  await sql`UPDATE "relationship_type" SET "minAgeGap" = CASE "name"
  WHEN 'Parent' THEN 15
  WHEN 'Child' THEN -60
  WHEN 'Grandparent' THEN 35
  WHEN 'Grandchild' THEN -100
  WHEN 'Sibling' THEN -25
  WHEN 'Cousin' THEN -18
  WHEN 'Aunt' THEN 10
  WHEN 'Uncle' THEN 10
  WHEN 'Niece' THEN -60
  WHEN 'Nephew' THEN -60
  WHEN 'College' THEN -5
  WHEN 'Secondary School' THEN -3
END, "maxAgeGap" = CASE "name"
  WHEN 'Parent' THEN 60
  WHEN 'Child' THEN -15
  WHEN 'Grandparent' THEN 100
  WHEN 'Grandchild' THEN -35
  WHEN 'Sibling' THEN 25
  WHEN 'Cousin' THEN 18
  WHEN 'Aunt' THEN 60
  WHEN 'Uncle' THEN 60
  WHEN 'Niece' THEN -10
  WHEN 'Nephew' THEN -10
  WHEN 'College' THEN 5
  WHEN 'Secondary School' THEN 3
END;`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "relationship_type" DROP COLUMN "maxAgeGap";`.execute(db);
  await sql`ALTER TABLE "relationship_type" DROP COLUMN "minAgeGap";`.execute(db);
}
