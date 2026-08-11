import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "person_detail" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "ownerId" uuid NOT NULL,
  "personId" uuid NOT NULL,
  "key" character varying NOT NULL,
  "value" character varying NOT NULL,
  "sortOrder" integer NOT NULL DEFAULT 0,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  CONSTRAINT "person_detail_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "person_detail_personId_fkey" FOREIGN KEY ("personId") REFERENCES "person" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "person_detail_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "person_detail_ownerId_idx" ON "person_detail" ("ownerId");`.execute(db);
  await sql`CREATE INDEX "person_detail_personId_idx" ON "person_detail" ("personId");`.execute(db);
  await sql`CREATE INDEX "person_detail_updateId_idx" ON "person_detail" ("updateId");`.execute(db);
  await sql`CREATE INDEX "person_detail_owner_key_idx" ON "person_detail" ("ownerId", lower("key"));`.execute(db);
  await sql`CREATE INDEX "person_detail_owner_key_value_idx" ON "person_detail" ("ownerId", lower("key"), lower("value"));`.execute(
    db,
  );
  await sql`CREATE OR REPLACE TRIGGER "person_detail_updatedAt"
  BEFORE UPDATE ON "person_detail"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "person_detail";`.execute(db);
}
