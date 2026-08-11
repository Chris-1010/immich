import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`ALTER TABLE "relationship_type" ADD "sortRank" integer NOT NULL DEFAULT 1000;`.execute(db);
  // Types seeded before this column existed get their family placement from their name, which is
  // what a fresh seed would have given them.
  await sql`UPDATE "relationship_type" SET "sortRank" = CASE "name"
  WHEN 'Parent' THEN 10
  WHEN 'Child' THEN 20
  WHEN 'Sibling' THEN 30
  WHEN 'Grandparent' THEN 40
  WHEN 'Grandchild' THEN 50
  WHEN 'Aunt' THEN 60
  WHEN 'Uncle' THEN 60
  WHEN 'Niece' THEN 70
  WHEN 'Nephew' THEN 70
  WHEN 'Cousin' THEN 80
  ELSE 1000
END;`.execute(db);
  await sql`CREATE TABLE "person_relationship_order" (
  "personId" uuid NOT NULL,
  "relatedPersonId" uuid NOT NULL,
  "sortOrder" integer NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "person_relationship_order_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "person_relationship_order_relatedPersonId_fkey" FOREIGN KEY ("relatedPersonId") REFERENCES "person" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "person_relationship_order_pkey" PRIMARY KEY ("personId", "relatedPersonId")
);`.execute(db);
  await sql`CREATE INDEX "person_relationship_order_relatedPersonId_idx" ON "person_relationship_order" ("relatedPersonId");`.execute(
    db,
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "person_relationship_order";`.execute(db);
  await sql`ALTER TABLE "relationship_type" DROP COLUMN "sortRank";`.execute(db);
}
