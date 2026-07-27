import { Kysely, sql } from 'kysely';

/**
 * Names are now read for the kinship term they contain, so types created before this — "Brother-in-law",
 * "Stepmother", "Son" — pick up the gender and the family placement their names have always stated.
 *
 * The longest term has to be tested first so "Grandson" is not read as a son. The terms are the
 * gendered ones only, so a type still named "Parent" or "Sibling" falls to the default rank until
 * it is renamed to the man or the woman it actually describes.
 *
 * Age ranges are deliberately left alone: unlike these two columns, an owner can edit them.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE "relationship_type" SET "gender" = CASE
      WHEN "name" ILIKE '%granddaughter%' THEN 'female'
      WHEN "name" ILIKE '%grandmother%' THEN 'female'
      WHEN "name" ILIKE '%grandfather%' THEN 'male'
      WHEN "name" ILIKE '%grandson%' THEN 'male'
      WHEN "name" ILIKE '%daughter%' THEN 'female'
      WHEN "name" ILIKE '%husband%' THEN 'male'
      WHEN "name" ILIKE '%brother%' THEN 'male'
      WHEN "name" ILIKE '%nephew%' THEN 'male'
      WHEN "name" ILIKE '%mother%' THEN 'female'
      WHEN "name" ILIKE '%sister%' THEN 'female'
      WHEN "name" ILIKE '%father%' THEN 'male'
      WHEN "name" ILIKE '%uncle%' THEN 'male'
      WHEN "name" ILIKE '%niece%' THEN 'female'
      WHEN "name" ILIKE '%aunt%' THEN 'female'
      WHEN "name" ILIKE '%wife%' THEN 'female'
      WHEN "name" ILIKE '%son%' THEN 'male'
      ELSE NULL
    END;
  `.execute(db);

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

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE "relationship_type" SET "gender" = CASE "name"
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
    END;
  `.execute(db);

  await sql`
    UPDATE "relationship_type" SET "sortRank" = CASE "name"
      WHEN 'Husband' THEN 5
      WHEN 'Wife' THEN 5
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
    END;
  `.execute(db);
}
