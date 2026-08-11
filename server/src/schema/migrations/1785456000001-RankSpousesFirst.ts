import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // Spouse types created before they had a rank of their own sat with everything unrecognised, at
  // the bottom. They belong at the top of a person's page, above the family tree.
  await sql`UPDATE "relationship_type" SET "sortRank" = 5 WHERE "name" IN ('Husband', 'Wife');`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`UPDATE "relationship_type" SET "sortRank" = 1000 WHERE "name" IN ('Husband', 'Wife');`.execute(db);
}
