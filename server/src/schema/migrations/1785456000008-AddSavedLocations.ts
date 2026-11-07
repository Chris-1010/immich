import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "saved_location" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "ownerId" uuid NOT NULL,
  "name" character varying NOT NULL,
  "latitude" double precision NOT NULL,
  "longitude" double precision NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  CONSTRAINT "saved_location_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "saved_location_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "saved_location_ownerId_idx" ON "saved_location" ("ownerId");`.execute(db);
  await sql`CREATE INDEX "saved_location_updateId_idx" ON "saved_location" ("updateId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "saved_location_updatedAt"
  BEFORE UPDATE ON "saved_location"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "saved_location";`.execute(db);
}
