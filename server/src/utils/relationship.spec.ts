import {
  ageGapBetween,
  ageGapForName,
  DEFAULT_SORT_RANK,
  filterTypesByGender,
  genderForName,
  inferGender,
  invertAgeGap,
  orderRelatedPeople,
  orderTypesByAgeFit,
  RelationshipGender,
  sortRankForName,
  symmetricAgeGap,
} from 'src/utils/relationship';

const person = (name: string, familyRank: number, sortOrder: number | null = null) => ({
  name,
  familyRank,
  sortOrder,
});

const PARENT = 10;
const CHILD = 20;
const SIBLING = 30;
const COUSIN = 80;
const OTHER = 1000;

const names = (people: { name: string }[]) => people.map(({ name }) => name);

describe(sortRankForName.name, () => {
  it('should rank close family ahead of everything else', () => {
    expect(sortRankForName('Wife')).toBeLessThan(sortRankForName('Mother'));
    expect(sortRankForName('Mother')).toBeLessThan(sortRankForName('Daughter'));
    expect(sortRankForName('Daughter')).toBeLessThan(sortRankForName('Sister'));
    expect(sortRankForName('Sister')).toBeLessThan(sortRankForName('Grandmother'));
    expect(sortRankForName('Grandmother')).toBeLessThan(sortRankForName('Uncle'));
    expect(sortRankForName('Uncle')).toBeLessThan(sortRankForName('Cousin'));
    expect(sortRankForName('Cousin')).toBeLessThan(sortRankForName('Work'));
  });

  it('should give the two genders of a tier the same rank', () => {
    expect(sortRankForName('Aunt')).toEqual(sortRankForName('Uncle'));
    expect(sortRankForName('Niece')).toEqual(sortRankForName('Nephew'));
    expect(sortRankForName('Wife')).toEqual(sortRankForName('Husband'));
    expect(sortRankForName('Son')).toEqual(sortRankForName('Daughter'));
    expect(sortRankForName('Father')).toEqual(sortRankForName('Mother'));
  });

  it('should rank a name by the family term inside it', () => {
    expect(sortRankForName('Brother-in-law')).toEqual(sortRankForName('Brother'));
    expect(sortRankForName('Stepmother')).toEqual(sortRankForName('Mother'));
    expect(sortRankForName('Godson')).toEqual(sortRankForName('Son'));
  });

  it('should read the longest term in a name, so a grandson is not a son', () => {
    expect(sortRankForName('Grandson')).toBeGreaterThan(sortRankForName('Son'));
    expect(sortRankForName('Granddaughter')).toEqual(sortRankForName('Grandson'));
    expect(sortRankForName('Grandmother')).toBeGreaterThan(sortRankForName('Mother'));
  });

  it('should give a neutral term the default rank, since the vocabulary is gendered', () => {
    expect(sortRankForName('Parent')).toEqual(DEFAULT_SORT_RANK);
    expect(sortRankForName('Sibling')).toEqual(DEFAULT_SORT_RANK);
  });

  it('should give an invented type the default rank', () => {
    expect(sortRankForName('Football team')).toEqual(sortRankForName('Work'));
  });
});

describe(orderRelatedPeople.name, () => {
  it('should put family first and sort the rest by name', () => {
    const ordered = orderRelatedPeople([
      person('Zoe', OTHER),
      person('Adam', OTHER),
      person('Cousin Kate', COUSIN),
      person('Mum', PARENT),
      person('Sam', SIBLING),
    ]);

    expect(names(ordered)).toEqual(['Mum', 'Sam', 'Cousin Kate', 'Adam', 'Zoe']);
  });

  it('should sort people of the same rank by name', () => {
    const ordered = orderRelatedPeople([person('Dad', PARENT), person('Mum', PARENT)]);

    expect(names(ordered)).toEqual(['Dad', 'Mum']);
  });

  it('should follow a saved order over the default one', () => {
    const ordered = orderRelatedPeople([
      person('Mum', PARENT, 2),
      person('Colleague', OTHER, 0),
      person('Sam', SIBLING, 1),
    ]);

    expect(names(ordered)).toEqual(['Colleague', 'Sam', 'Mum']);
  });

  it('should slot a newly related parent above the saved people it outranks', () => {
    const ordered = orderRelatedPeople([
      person('Sam', SIBLING, 0),
      person('Colleague', OTHER, 1),
      person('Dad', PARENT),
    ]);

    expect(names(ordered)).toEqual(['Dad', 'Sam', 'Colleague']);
  });

  it('should append a newly related person that outranks nobody', () => {
    const ordered = orderRelatedPeople([
      person('Mum', PARENT, 0),
      person('Sam', SIBLING, 1),
      person('Colleague', OTHER),
    ]);

    expect(names(ordered)).toEqual(['Mum', 'Sam', 'Colleague']);
  });

  it('should keep a manual order that contradicts the default one when someone new arrives', () => {
    // Colleague was dragged above Mum on purpose. A new sibling belongs under the parent, not at
    // the top, so it lands ahead of the first saved person the default rank would put after it.
    const ordered = orderRelatedPeople([
      person('Colleague', OTHER, 0),
      person('Mum', PARENT, 1),
      person('Sam', SIBLING),
    ]);

    expect(names(ordered)).toEqual(['Sam', 'Colleague', 'Mum']);
  });

  it('should place several new people among themselves in default order', () => {
    const ordered = orderRelatedPeople([
      person('Colleague', OTHER, 0),
      person('Sam', SIBLING),
      person('Mum', PARENT),
      person('Junior', CHILD),
    ]);

    expect(names(ordered)).toEqual(['Mum', 'Junior', 'Sam', 'Colleague']);
  });

  it('should not lose anybody', () => {
    const people = [person('Mum', PARENT, 5), person('Sam', SIBLING), person('Zoe', OTHER, 1)];

    expect(orderRelatedPeople(people)).toHaveLength(people.length);
  });

  it('should leave the input array alone', () => {
    const people = [person('Zoe', OTHER), person('Mum', PARENT)];

    orderRelatedPeople(people);

    expect(names(people)).toEqual(['Zoe', 'Mum']);
  });
});

const type = (name: string, inverseName: string, minAgeGap: number | null = null, maxAgeGap: number | null = null) => ({
  name,
  inverseName,
  minAgeGap,
  maxAgeGap,
});

const PARENT_TYPE = type('Parent', 'Child', 15, 60);
const CHILD_TYPE = type('Child', 'Parent', -60, -15);
const GRANDPARENT_TYPE = type('Grandparent', 'Grandchild', 35, 100);
const SIBLING_TYPE = type('Sibling', 'Sibling', -25, 25);
const COUSIN_TYPE = type('Cousin', 'Cousin', -18, 18);
const COLLEGE = type('College', 'College', -5, 5);
const SCHOOL = type('Secondary School', 'Secondary School', -3, 3);
const WORK = type('Work', 'Work');

const STARTER = [PARENT_TYPE, CHILD_TYPE, GRANDPARENT_TYPE, SIBLING_TYPE, COUSIN_TYPE, COLLEGE, SCHOOL, WORK];

const typeNames = (types: Array<{ name: string }>) => types.map(({ name }) => name);
const suggestedNames = (types: Array<{ name: string; suggested: boolean }>) =>
  types.filter(({ suggested }) => suggested).map(({ name }) => name);

describe('ageGapForName', () => {
  it('should give a known family type its seeded range', () => {
    expect(ageGapForName('Mother')).toEqual({ minAgeGap: 15, maxAgeGap: 60 });
  });

  it('should give a range to the family term inside a name', () => {
    expect(ageGapForName('Stepfather')).toEqual(ageGapForName('Father'));
    expect(ageGapForName('Grandson')).toEqual({ minAgeGap: -100, maxAgeGap: -35 });
  });

  it('should give an invented type no range at all', () => {
    expect(ageGapForName('Book club')).toEqual({ minAgeGap: null, maxAgeGap: null });
  });
});

describe('invertAgeGap', () => {
  it('should read a parent range from the other end as a child range', () => {
    expect(invertAgeGap({ minAgeGap: 15, maxAgeGap: 60 })).toEqual({ minAgeGap: -60, maxAgeGap: -15 });
  });

  it('should leave an absent range absent', () => {
    expect(invertAgeGap({ minAgeGap: null, maxAgeGap: null })).toEqual({ minAgeGap: null, maxAgeGap: null });
  });
});

describe('symmetricAgeGap', () => {
  it('should mirror a lopsided range so the type reads the same from both ends', () => {
    expect(symmetricAgeGap({ minAgeGap: -3, maxAgeGap: 25 })).toEqual({ minAgeGap: -25, maxAgeGap: 25 });
  });

  it('should leave an absent range absent', () => {
    expect(symmetricAgeGap({ minAgeGap: null, maxAgeGap: null })).toEqual({ minAgeGap: null, maxAgeGap: null });
  });
});

describe('ageGapBetween', () => {
  it('should be positive when the counterpart is the older of the two', () => {
    expect(ageGapBetween('2000-06-01', '1970-06-01')).toBeCloseTo(30, 1);
  });

  it('should be negative when the counterpart is the younger of the two', () => {
    expect(ageGapBetween('1970-06-01', '2000-06-01')).toBeCloseTo(-30, 1);
  });

  it('should be unknown when either birth date is missing', () => {
    expect(ageGapBetween('2000-06-01', null)).toBeNull();
    expect(ageGapBetween(null, '2000-06-01')).toBeNull();
  });
});

describe('orderTypesByAgeFit', () => {
  it('should leave the order alone when a birth date is missing', () => {
    const ordered = orderTypesByAgeFit(STARTER, null);

    expect(typeNames(ordered)).toEqual(typeNames(STARTER));
    expect(suggestedNames(ordered)).toEqual([]);
  });

  it('should offer the school years first when the two are nearly the same age', () => {
    const ordered = orderTypesByAgeFit(STARTER, 1);

    expect(typeNames(ordered).slice(0, 4)).toEqual(['Secondary School', 'College', 'Cousin', 'Sibling']);
    expect(suggestedNames(ordered)).toEqual(['Secondary School', 'College', 'Cousin', 'Sibling']);
  });

  it('should offer a parent first at a generation of difference', () => {
    const ordered = orderTypesByAgeFit(STARTER, 30);

    expect(typeNames(ordered)[0]).toEqual('Parent');
    expect(suggestedNames(ordered)).toEqual(['Parent']);
  });

  it('should offer a child when the counterpart is the younger one', () => {
    const ordered = orderTypesByAgeFit(STARTER, -30);

    expect(typeNames(ordered)[0]).toEqual('Child');
  });

  it('should offer a grandparent once a parent is too young to be one', () => {
    const ordered = orderTypesByAgeFit(STARTER, 70);

    expect(typeNames(ordered)[0]).toEqual('Grandparent');
  });

  it('should put a type with no expectation ahead of one the ages rule out', () => {
    const ordered = orderTypesByAgeFit(STARTER, 30);
    const names = typeNames(ordered);

    expect(names.indexOf('Work')).toBeLessThan(names.indexOf('Secondary School'));
  });

  it('should rank the ruled out types by how narrowly they miss', () => {
    const ordered = orderTypesByAgeFit([SCHOOL, GRANDPARENT_TYPE, COLLEGE], 8);

    expect(typeNames(ordered)).toEqual(['College', 'Secondary School', 'Grandparent']);
  });

  it('should mark nothing as suggested when every range misses', () => {
    const ordered = orderTypesByAgeFit([SCHOOL, COLLEGE], 40);

    expect(suggestedNames(ordered)).toEqual([]);
  });

  it('should tell two types with the same range apart by name', () => {
    const uncle = type('Uncle', 'Nephew', 10, 60);
    const aunt = type('Aunt', 'Niece', 10, 60);

    expect(typeNames(orderTypesByAgeFit([uncle, aunt], 25))).toEqual(['Aunt', 'Uncle']);
  });

  it('should leave the input array alone', () => {
    const types = [WORK, PARENT_TYPE];

    orderTypesByAgeFit(types, 30);

    expect(typeNames(types)).toEqual(['Work', 'Parent']);
  });
});

const gendered = (name: string, gender: RelationshipGender | null, inverseGender: RelationshipGender | null) => ({
  name,
  gender,
  inverseGender,
});

const UNCLE_NEPHEW = gendered('Uncle', 'male', 'male');
const UNCLE_NIECE = gendered('Uncle', 'male', 'female');
const AUNT_NEPHEW = gendered('Aunt', 'female', 'male');
const AUNT_NIECE = gendered('Aunt', 'female', 'female');
const COUSIN_PAIR = gendered('Cousin', null, null);

describe('genderForName', () => {
  it('should read a gender off a name that carries one', () => {
    expect(genderForName('Nephew')).toBe('male');
    expect(genderForName('Aunt')).toBe('female');
  });

  it('should read the gender off the family term inside a name', () => {
    expect(genderForName('Brother-in-law')).toBe('male');
    expect(genderForName('Stepdaughter')).toBe('female');
    expect(genderForName('Half sister')).toBe('female');
    expect(genderForName('Godson')).toBe('male');
  });

  it('should read nothing off a name that carries nothing', () => {
    expect(genderForName('Cousin')).toBeNull();
    expect(genderForName('Book club')).toBeNull();
  });
});

describe('inferGender', () => {
  it('should take the gender the labels agree on', () => {
    expect(inferGender(['male', null, 'male'])).toBe('male');
  });

  it('should infer nothing when no label states anything', () => {
    expect(inferGender([null, null])).toBeNull();
    expect(inferGender([])).toBeNull();
  });

  it('should infer nothing from labels that disagree, since one of them is wrong', () => {
    expect(inferGender(['male', 'female'])).toBeNull();
  });
});

describe('filterTypesByGender', () => {
  const ALL = [UNCLE_NEPHEW, UNCLE_NIECE, AUNT_NEPHEW, AUNT_NIECE, COUSIN_PAIR];

  it('should offer everything while neither person is known', () => {
    expect(filterTypesByGender(ALL, null, null)).toEqual(ALL);
  });

  it('should drop the halves that contradict the counterpart', () => {
    expect(typeNames(filterTypesByGender(ALL, null, 'female'))).toEqual(['Aunt', 'Aunt', 'Cousin']);
  });

  it('should drop the pairs whose far half contradicts the subject', () => {
    expect(filterTypesByGender(ALL, 'male', null)).toEqual([UNCLE_NEPHEW, AUNT_NEPHEW, COUSIN_PAIR]);
  });

  it('should leave one pair when both people are known', () => {
    expect(filterTypesByGender(ALL, 'male', 'female')).toEqual([AUNT_NEPHEW, COUSIN_PAIR]);
  });

  it('should keep a type that states nothing whoever the two people are', () => {
    expect(filterTypesByGender([COUSIN_PAIR], 'female', 'male')).toEqual([COUSIN_PAIR]);
  });
});
