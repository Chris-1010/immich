import { Kysely, sql } from 'kysely';

/**
 * In-laws and god-relations were ranked as whatever term they contain, putting a father-in-law
 * among the fathers. They get places of their own, near the blood relatives they stand beside
 * rather than below all of them.
 *
 * Names are stripped to their letters first, so a rank does not depend on how the owner punctuated
 * "in-law", and the longest term is tested first so "Son-in-law" is not read as a son.
 */
const rankFromName = sql`
  UPDATE "relationship_type" AS "type" SET "sortRank" = CASE
    WHEN "bare"."term" LIKE '%granddaughter%' THEN 50
    WHEN "bare"."term" LIKE '%daughterinlaw%' THEN 52
    WHEN "bare"."term" LIKE '%brotherinlaw%' THEN 35
    WHEN "bare"."term" LIKE '%sisterinlaw%' THEN 35
    WHEN "bare"."term" LIKE '%grandmother%' THEN 40
    WHEN "bare"."term" LIKE '%grandfather%' THEN 40
    WHEN "bare"."term" LIKE '%goddaughter%' THEN 65
    WHEN "bare"."term" LIKE '%motherinlaw%' THEN 51
    WHEN "bare"."term" LIKE '%fatherinlaw%' THEN 51
    WHEN "bare"."term" LIKE '%godfather%' THEN 55
    WHEN "bare"."term" LIKE '%godmother%' THEN 55
    WHEN "bare"."term" LIKE '%soninlaw%' THEN 52
    WHEN "bare"."term" LIKE '%grandson%' THEN 50
    WHEN "bare"."term" LIKE '%daughter%' THEN 20
    WHEN "bare"."term" LIKE '%husband%' THEN 5
    WHEN "bare"."term" LIKE '%brother%' THEN 30
    WHEN "bare"."term" LIKE '%godson%' THEN 65
    WHEN "bare"."term" LIKE '%nephew%' THEN 70
    WHEN "bare"."term" LIKE '%cousin%' THEN 80
    WHEN "bare"."term" LIKE '%mother%' THEN 10
    WHEN "bare"."term" LIKE '%sister%' THEN 30
    WHEN "bare"."term" LIKE '%father%' THEN 10
    WHEN "bare"."term" LIKE '%uncle%' THEN 60
    WHEN "bare"."term" LIKE '%niece%' THEN 70
    WHEN "bare"."term" LIKE '%aunt%' THEN 60
    WHEN "bare"."term" LIKE '%wife%' THEN 5
    WHEN "bare"."term" LIKE '%son%' THEN 20
    ELSE 1000
  END
  FROM (SELECT "id", lower(regexp_replace("name", '[^a-zA-Z]', '', 'g')) AS "term" FROM "relationship_type") AS "bare"
  WHERE "bare"."id" = "type"."id";
`;

export async function up(db: Kysely<any>): Promise<void> {
  await rankFromName.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // The tier an in-law or a god-relation came from: the rank of the term inside its name.
  await sql`
    UPDATE "relationship_type" SET "sortRank" = CASE
      WHEN "name" ILIKE '%granddaughter%' THEN 50
      WHEN "name" ILIKE '%grandmother%' THEN 40
      WHEN "name" ILIKE '%grandfather%' THEN 40
      WHEN "name" ILIKE '%grandson%' THEN 50
      WHEN "name" ILIKE '%daughter%' THEN 20
      WHEN "name" ILIKE '%husband%' THEN 5
      WHEN "name" ILIKE '%brother%' THEN 30
      WHEN "name" ILIKE '%nephew%' THEN 70
      WHEN "name" ILIKE '%cousin%' THEN 80
      WHEN "name" ILIKE '%mother%' THEN 10
      WHEN "name" ILIKE '%sister%' THEN 30
      WHEN "name" ILIKE '%father%' THEN 10
      WHEN "name" ILIKE '%uncle%' THEN 60
      WHEN "name" ILIKE '%niece%' THEN 70
      WHEN "name" ILIKE '%aunt%' THEN 60
      WHEN "name" ILIKE '%wife%' THEN 5
      WHEN "name" ILIKE '%son%' THEN 20
      ELSE 1000
    END;
  `.execute(db);
}
