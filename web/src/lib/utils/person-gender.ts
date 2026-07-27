import { getPersonGenders, RelationshipGender } from '@immich/sdk';

/**
 * The ring a face wears for what its relationships state about it. Nothing states a gender for
 * someone whose labels are all neutral, and the ring is left off rather than guessed at: an
 * unringed face means unknown, not neither.
 */
export const genderRingClass = (gender: RelationshipGender | null | undefined) => {
  switch (gender) {
    case RelationshipGender.Male: {
      return 'ring-2 ring-[royalblue]';
    }
    case RelationshipGender.Female: {
      return 'ring-2 ring-[hotpink]';
    }
    default: {
      return '';
    }
  }
};

/**
 * Everyone the library states a gender for, keyed by person. Only the people something is known
 * about come back, so a missing key is the answer for everyone else.
 *
 * Read fresh per page rather than cached: a label added on a relationships page changes what this
 * says about two people, and a stale ring is worse than a late one.
 */
export const loadPersonGenders = async (): Promise<Record<string, RelationshipGender>> => {
  const genders = await getPersonGenders();

  return Object.fromEntries(genders.map(({ personId, gender }) => [personId, gender]));
};
