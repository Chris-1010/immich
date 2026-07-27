/**
 * Reads a name for the kinship term it contains rather than for what it is exactly, so the
 * variations an owner will actually type — "Brother-in-law", "Stepbrother", "Half brother" — are
 * all recognised as the brother they name, without every variation needing its own entry.
 *
 * The longest matching term wins, which is what stops "Grandson" being read as a son and
 * "Grandmother" as a mother. A name matching nothing is left to the caller's fallback.
 */
const readFamilyTerm = <T>(terms: Record<string, T>, name: string): T | undefined => {
  const haystack = name.trim().toLowerCase();

  let longest: string | undefined;
  for (const term of Object.keys(terms)) {
    if (haystack.includes(term.toLowerCase()) && (longest === undefined || term.length > longest.length)) {
      longest = term;
    }
  }

  return longest === undefined ? undefined : terms[longest];
};

/**
 * Where a relationship type sorts on a person's page before anyone has dragged anything.
 *
 * Ranks are per type half, not per pair, because the label shown on a page describes the other
 * person: a grandmother's page shows "Grandson", so both halves need their own place. Sparse
 * numbering leaves room to slot a rank in between later without renumbering.
 *
 * The terms are gendered wherever English has a gendered word, since a type that names a gender is
 * a type the picker can rule out. "Cousin" stays because English offers nothing else. The two
 * genders of a tier always rank together — a son and a daughter are equally children.
 */
export const FAMILY_SORT_RANKS: Record<string, number> = {
  // A spouse heads the list: they are the one person on a page who is family by choice rather
  // than by descent, so they sit above the tree rather than anywhere within it.
  Husband: 5,
  Wife: 5,
  Father: 10,
  Mother: 10,
  Son: 20,
  Daughter: 20,
  Brother: 30,
  Sister: 30,
  Grandfather: 40,
  Grandmother: 40,
  Grandson: 50,
  Granddaughter: 50,
  Aunt: 60,
  Uncle: 60,
  Niece: 70,
  Nephew: 70,
  Cousin: 80,
};

/** Everything that is not close family: friends, colleagues, and anything the owner invents. */
export const DEFAULT_SORT_RANK = 1000;

/**
 * The rank a type gets from its name. Applied when a type is created as well as when the starter
 * set is seeded, so an owner who deletes "Mother" and recreates it gets the family placement back.
 */
export const sortRankForName = (name: string): number => readFamilyTerm(FAMILY_SORT_RANKS, name) ?? DEFAULT_SORT_RANK;

/** The part of a related person the ordering rules care about. */
export interface Orderable {
  name: string;
  /** The lowest rank among the labels this person holds: one "Mother" chip puts them with parents. */
  familyRank: number;
  /** Their position in a manual ordering, or null if they were not in the list when it was saved. */
  sortOrder: number | null;
}

/** The ordering used when nobody has dragged anything: family first, then alphabetical. */
const byDefaultRank = (a: Orderable, b: Orderable) => a.familyRank - b.familyRank || a.name.localeCompare(b.name);

/**
 * Orders the people on a person's page.
 *
 * With no manual ordering saved, this is the default rank: close family first, in family-tree
 * order, then everyone else alphabetically.
 *
 * Once a manual ordering exists it is authoritative for everyone it covers. People related since
 * it was saved are not simply appended — a parent added later belongs at the top, not below the
 * colleagues — so each one is slotted in ahead of the first saved person that the default rank
 * would put after them, and appended only if there is no such person.
 */
export const orderRelatedPeople = <T extends Orderable>(people: T[]): T[] => {
  const anchored = people.filter((person) => person.sortOrder !== null).toSorted((a, b) => a.sortOrder! - b.sortOrder!);

  if (anchored.length === 0) {
    return people.toSorted(byDefaultRank);
  }

  const ordered = [...anchored];
  const unanchored = people.filter((person) => person.sortOrder === null).toSorted(byDefaultRank);

  for (const person of unanchored) {
    const at = ordered.findIndex((existing) => byDefaultRank(existing, person) > 0);
    if (at === -1) {
      ordered.push(person);
    } else {
      ordered.splice(at, 0, person);
    }
  }

  return ordered;
};

/**
 * The age difference a relationship type expects, in signed years: how much older the counterpart
 * usually is than the subject. A type describes the counterpart, so "Mother" expects a positive
 * gap and "Son" the negative of it.
 *
 * Both bounds are set together or not at all. No range means age says nothing about the type —
 * a colleague can be any age — which is different from a range that happens not to fit.
 */
export interface AgeGap {
  minAgeGap: number | null;
  maxAgeGap: number | null;
}

/** No two people are further apart than this, so a range outside it is a typo rather than a fact. */
export const MAX_AGE_GAP = 150;

/**
 * The ranges the starter types are seeded with. Deliberately generous: these only order the
 * picker, so a range that is too tight hides a correct answer, while one that is too loose
 * merely offers an unlikely one further down.
 */
export const FAMILY_AGE_GAPS: Record<string, [min: number, max: number]> = {
  Husband: [-15, 15],
  Wife: [-15, 15],
  Father: [15, 60],
  Mother: [15, 60],
  Son: [-60, -15],
  Daughter: [-60, -15],
  Grandfather: [35, 100],
  Grandmother: [35, 100],
  Grandson: [-100, -35],
  Granddaughter: [-100, -35],
  Brother: [-25, 25],
  Sister: [-25, 25],
  Cousin: [-18, 18],
  Aunt: [10, 60],
  Uncle: [10, 60],
  Niece: [-60, -10],
  Nephew: [-60, -10],
  College: [-5, 5],
  'Secondary School': [-3, 3],
};

/**
 * The range a type gets from its name, matching how {@link sortRankForName} works: a recreated
 * "Mother" behaves like the seeded one, and a "Stepmother" like a mother.
 */
export const ageGapForName = (name: string): AgeGap => {
  const range = readFamilyTerm(FAMILY_AGE_GAPS, name);
  return range ? { minAgeGap: range[0], maxAgeGap: range[1] } : { minAgeGap: null, maxAgeGap: null };
};

/** The same expectation read from the other end: the bounds swap places and change sign. */
export const invertAgeGap = ({ minAgeGap, maxAgeGap }: AgeGap): AgeGap => ({
  minAgeGap: maxAgeGap === null ? null : -maxAgeGap,
  maxAgeGap: minAgeGap === null ? null : -minAgeGap,
});

/**
 * A symmetric type is its own inverse, so its range has to equal its own negation — "Cousin"
 * cannot expect the counterpart to be older when both people hold the same label. The widest
 * bound entered is mirrored to both sides.
 */
export const symmetricAgeGap = ({ minAgeGap, maxAgeGap }: AgeGap): AgeGap => {
  if (minAgeGap === null || maxAgeGap === null) {
    return { minAgeGap: null, maxAgeGap: null };
  }

  const bound = Math.max(Math.abs(minAgeGap), Math.abs(maxAgeGap));
  return { minAgeGap: -bound, maxAgeGap: bound };
};

const MILLISECONDS_PER_YEAR = 365.2425 * 24 * 60 * 60 * 1000;

/**
 * How much older the counterpart is than the subject, in years, or null when either birth date
 * is unknown. Fractional on purpose: the ranges are fuzzy, so there is nothing to gain by
 * rounding the input to them.
 */
export const ageGapBetween = (
  subjectBirthDate: Date | string | null | undefined,
  counterpartBirthDate: Date | string | null | undefined,
): number | null => {
  if (!subjectBirthDate || !counterpartBirthDate) {
    return null;
  }

  const subject = new Date(subjectBirthDate).getTime();
  const counterpart = new Date(counterpartBirthDate).getTime();
  if (Number.isNaN(subject) || Number.isNaN(counterpart)) {
    return null;
  }

  return (subject - counterpart) / MILLISECONDS_PER_YEAR;
};

/**
 * The gender a relationship type states about the person it describes. "Uncle" can only ever
 * describe a man and "Niece" only a woman; "Cousin" states nothing and is left null.
 *
 * Carried by the type half rather than by the pair, because the two halves are independent of each
 * other: the Uncle / Niece pair names a man at one end and a woman at the other.
 */
export type RelationshipGender = 'male' | 'female';

/**
 * The genders the common English kinship terms carry. Only the base terms are listed, since a name
 * is read for the term it contains: "Godson", "Stepson" and "Son-in-law" are all covered by "Son".
 *
 * A name containing none of them states nothing, which is the safe answer: an unrecognised name
 * only means the picker offers a little more than it strictly could.
 */
export const FAMILY_GENDERS: Record<string, RelationshipGender> = {
  Father: 'male',
  Mother: 'female',
  Son: 'male',
  Daughter: 'female',
  Brother: 'male',
  Sister: 'female',
  Uncle: 'male',
  Aunt: 'female',
  Nephew: 'male',
  Niece: 'female',
  Husband: 'male',
  Wife: 'female',
};

/** The gender a type gets from its name, so renaming a type re-reads what its name states. */
export const genderForName = (name: string): RelationshipGender | null => readFamilyTerm(FAMILY_GENDERS, name) ?? null;

/**
 * The gender the labels a person already holds state about them, or null when none of them state
 * anything. Labels that disagree — which only happens when one of them is wrong — state nothing
 * between them, so a single mistake never narrows what the picker offers.
 */
export const inferGender = (genders: Array<RelationshipGender | null>): RelationshipGender | null => {
  const stated = new Set(genders.filter((gender) => gender !== null));
  return stated.size === 1 ? [...stated][0] : null;
};

/** The part of a relationship type the gender rules read. */
export interface Genderable {
  gender: RelationshipGender | null;
  inverseGender: RelationshipGender | null;
}

const agreesWith = (stated: RelationshipGender | null, known: RelationshipGender | null) =>
  stated === null || known === null || stated === known;

/**
 * Drops the types that contradict what the two people's existing labels already state.
 *
 * A type describes the counterpart and its inverse describes the subject, so both ends are
 * checked: once someone is recorded as a nephew, their page stops offering "Niece" for themselves
 * and stops offering the Aunt / Nephew pair — the half naming them stays male either way, but the
 * half naming the other person has to match whatever that person is already known to be.
 */
export const filterTypesByGender = <T extends Genderable>(
  types: T[],
  subjectGender: RelationshipGender | null,
  counterpartGender: RelationshipGender | null,
): T[] =>
  types.filter((type) => agreesWith(type.gender, counterpartGender) && agreesWith(type.inverseGender, subjectGender));

/** The part of a relationship type the picker ordering reads. */
export interface AgeFittable extends AgeGap {
  name: string;
  inverseName: string;
}

/** The order the picker falls back on, and the order the types are read from the database in. */
const byTypeName = (a: AgeFittable, b: AgeFittable) =>
  a.name.localeCompare(b.name) || a.inverseName.localeCompare(b.inverseName);

const fitsGap = ({ minAgeGap, maxAgeGap }: AgeGap, gap: number) =>
  minAgeGap !== null && maxAgeGap !== null && gap >= minAgeGap && gap <= maxAgeGap;

/** How far outside its range the gap falls, for ranking the types that miss by the least. */
const distanceFromGap = ({ minAgeGap, maxAgeGap }: AgeGap, gap: number) => {
  if (minAgeGap === null || maxAgeGap === null) {
    return 0;
  }

  return gap < minAgeGap ? minAgeGap - gap : gap - maxAgeGap;
};

const rangeWidth = ({ minAgeGap, maxAgeGap }: AgeGap) =>
  minAgeGap === null || maxAgeGap === null ? Number.POSITIVE_INFINITY : maxAgeGap - minAgeGap;

/**
 * Orders the type picker by how well each type fits the age difference between the two people.
 *
 * Types whose range covers the gap come first, narrowest range first: a range that only spans a
 * few years is a far more specific claim than one spanning fifty, so two people born a year apart
 * are offered "Secondary School" ahead of "Sibling". Types with no range follow, since age says
 * nothing for or against them, and the ones the gap rules out come last, closest miss first.
 *
 * The gap is null when either birth date is unknown, and the picker is left in name order.
 */
export const orderTypesByAgeFit = <T extends AgeFittable>(
  types: T[],
  gap: number | null,
): Array<T & { suggested: boolean }> => {
  if (gap === null) {
    return types.map((type) => ({ ...type, suggested: false }));
  }

  const bucket = (type: T) => {
    if (fitsGap(type, gap)) {
      return 0;
    }

    return type.minAgeGap === null || type.maxAgeGap === null ? 1 : 2;
  };

  return types
    .map((type) => ({ type, bucket: bucket(type) }))
    .toSorted(
      (a, b) =>
        a.bucket - b.bucket ||
        (a.bucket === 0 ? rangeWidth(a.type) - rangeWidth(b.type) : 0) ||
        (a.bucket === 2 ? distanceFromGap(a.type, gap) - distanceFromGap(b.type, gap) : 0) ||
        byTypeName(a.type, b.type),
    )
    .map(({ type, bucket }) => ({ ...type, suggested: bucket === 0 }));
};
