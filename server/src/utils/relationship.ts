/**
 * Where a relationship type sorts on a person's page before anyone has dragged anything.
 *
 * Ranks are per type half, not per pair, because the label shown on a page describes the other
 * person: a grandparent's page shows "Grandchild", so both halves need their own place. Sparse
 * numbering leaves room to slot a rank in between later without renumbering.
 */
export const FAMILY_SORT_RANKS: Record<string, number> = {
  Parent: 10,
  Child: 20,
  Sibling: 30,
  Grandparent: 40,
  Grandchild: 50,
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
 * set is seeded, so an owner who deletes "Parent" and recreates it gets the family placement back.
 */
export const sortRankForName = (name: string): number => FAMILY_SORT_RANKS[name.trim()] ?? DEFAULT_SORT_RANK;

/** The part of a related person the ordering rules care about. */
export interface Orderable {
  name: string;
  /** The lowest rank among the labels this person holds: one "Parent" chip puts them with parents. */
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
 * usually is than the subject. A type describes the counterpart, so "Parent" expects a positive
 * gap and "Child" the negative of it.
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
  Parent: [15, 60],
  Child: [-60, -15],
  Grandparent: [35, 100],
  Grandchild: [-100, -35],
  Sibling: [-25, 25],
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
 * "Parent" behaves like the seeded one.
 */
export const ageGapForName = (name: string): AgeGap => {
  const range = FAMILY_AGE_GAPS[name.trim()];
  return range ? { minAgeGap: range[0], maxAgeGap: range[1] } : { minAgeGap: null, maxAgeGap: null };
};

/** The same expectation read from the other end: the bounds swap places and change sign. */
export const invertAgeGap = ({ minAgeGap, maxAgeGap }: AgeGap): AgeGap => ({
  minAgeGap: maxAgeGap === null ? null : -maxAgeGap,
  maxAgeGap: minAgeGap === null ? null : -minAgeGap,
});

/**
 * A symmetric type is its own inverse, so its range has to equal its own negation — "Sibling"
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
