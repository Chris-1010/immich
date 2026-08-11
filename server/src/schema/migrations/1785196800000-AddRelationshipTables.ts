import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE TABLE "relationship_type" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "ownerId" uuid NOT NULL,
  "name" character varying NOT NULL,
  "inverseId" uuid,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updatedAt" timestamp with time zone NOT NULL DEFAULT now(),
  "updateId" uuid NOT NULL DEFAULT immich_uuid_v7(),
  CONSTRAINT "relationship_type_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "relationship_type_inverseId_fkey" FOREIGN KEY ("inverseId") REFERENCES "relationship_type" ("id") ON UPDATE NO ACTION ON DELETE CASCADE,
  CONSTRAINT "relationship_type_ownerId_name_inverseId_uq" UNIQUE ("ownerId", "name", "inverseId"),
  CONSTRAINT "relationship_type_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "relationship_type_inverseId_idx" ON "relationship_type" ("inverseId");`.execute(db);
  await sql`CREATE INDEX "relationship_type_updateId_idx" ON "relationship_type" ("updateId");`.execute(db);
  await sql`CREATE OR REPLACE TRIGGER "relationship_type_updatedAt"
  BEFORE UPDATE ON "relationship_type"
  FOR EACH ROW
  EXECUTE FUNCTION updated_at();`.execute(db);
  await sql`CREATE TABLE "person_relationship" (
  "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
  "ownerId" uuid NOT NULL,
  "subjectId" uuid NOT NULL,
  "counterpartId" uuid NOT NULL,
  "typeId" uuid NOT NULL,
  "createdAt" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "person_relationship_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "user" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "person_relationship_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "person" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "person_relationship_counterpartId_fkey" FOREIGN KEY ("counterpartId") REFERENCES "person" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "person_relationship_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "relationship_type" ("id") ON UPDATE CASCADE ON DELETE CASCADE,
  CONSTRAINT "person_relationship_subjectId_counterpartId_typeId_uq" UNIQUE ("subjectId", "counterpartId", "typeId"),
  CONSTRAINT "person_relationship_no_self_chk" CHECK ("subjectId" <> "counterpartId"),
  CONSTRAINT "person_relationship_pkey" PRIMARY KEY ("id")
);`.execute(db);
  await sql`CREATE INDEX "person_relationship_ownerId_idx" ON "person_relationship" ("ownerId");`.execute(db);
  await sql`CREATE INDEX "person_relationship_subjectId_idx" ON "person_relationship" ("subjectId");`.execute(db);
  await sql`CREATE INDEX "person_relationship_counterpartId_idx" ON "person_relationship" ("counterpartId");`.execute(
    db,
  );
  await sql`CREATE INDEX "person_relationship_typeId_idx" ON "person_relationship" ("typeId");`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE "person_relationship";`.execute(db);
  await sql`DROP TABLE "relationship_type";`.execute(db);
}
