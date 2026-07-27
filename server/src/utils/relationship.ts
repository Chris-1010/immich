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
  const anchored = people.filter((person) => person.sortOrder !== null).sort((a, b) => a.sortOrder! - b.sortOrder!);

  if (anchored.length === 0) {
    return [...people].sort(byDefaultRank);
  }

  const ordered = [...anchored];
  const unanchored = people.filter((person) => person.sortOrder === null).sort(byDefaultRank);

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
