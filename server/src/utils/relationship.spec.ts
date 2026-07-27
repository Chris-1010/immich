import { orderRelatedPeople, sortRankForName } from 'src/utils/relationship';

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
    expect(sortRankForName('Parent')).toBeLessThan(sortRankForName('Child'));
    expect(sortRankForName('Child')).toBeLessThan(sortRankForName('Sibling'));
    expect(sortRankForName('Sibling')).toBeLessThan(sortRankForName('Grandparent'));
    expect(sortRankForName('Grandparent')).toBeLessThan(sortRankForName('Uncle'));
    expect(sortRankForName('Uncle')).toBeLessThan(sortRankForName('Cousin'));
    expect(sortRankForName('Cousin')).toBeLessThan(sortRankForName('Work'));
  });

  it('should give the two halves of a gendered pair the same rank', () => {
    expect(sortRankForName('Aunt')).toEqual(sortRankForName('Uncle'));
    expect(sortRankForName('Niece')).toEqual(sortRankForName('Nephew'));
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
