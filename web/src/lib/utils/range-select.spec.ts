import { idsInRange } from '$lib/utils/range-select';
import { describe, expect, it } from 'vitest';

const list = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];

describe('idsInRange', () => {
  it('should take both ends and everything between them', () => {
    expect(idsInRange(list, 'b', 'd')).toEqual(['b', 'c', 'd']);
  });

  it('should read a range drawn upwards the same as one drawn downwards', () => {
    expect(idsInRange(list, 'd', 'b')).toEqual(idsInRange(list, 'b', 'd'));
  });

  it('should take the one entry when both ends are it', () => {
    expect(idsInRange(list, 'c', 'c')).toEqual(['c']);
  });

  it('should take nothing when an end is no longer in the list', () => {
    // The anchor was ticked before a search narrowed it away, so there is no range on screen.
    expect(idsInRange(list, 'z', 'b')).toEqual([]);
  });
});
