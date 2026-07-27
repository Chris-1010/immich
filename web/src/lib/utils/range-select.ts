/**
 * The ids of everything between two entries, inclusive, in the order the list is shown in. Either
 * end may be the one clicked first: a range is the same range whichever way it was drawn.
 *
 * An anchor that has since been filtered out of the list gives nothing back, since a range across
 * entries nobody can see is not one anybody meant to draw.
 */
export const idsInRange = <T extends { id: string }>(ordered: T[], anchorId: string, targetId: string): string[] => {
  const anchor = ordered.findIndex(({ id }) => id === anchorId);
  const target = ordered.findIndex(({ id }) => id === targetId);
  if (anchor === -1 || target === -1) {
    return [];
  }

  const [first, last] = anchor <= target ? [anchor, target] : [target, anchor];

  return ordered.slice(first, last + 1).map(({ id }) => id);
};
