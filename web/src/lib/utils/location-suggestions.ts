import { LocationSearchResultType, type LocationSearchResultDto, type PersonPlaceResponseDto } from '@immich/sdk';

const RECENT_PERSON_PLACES_KEY = 'immich_recent_person_places';
export const MAX_RECENT_PERSON_PLACES = 10;

/**
 * The people's places picked most recently in the location picker, newest first. Kept per browser;
 * storage that is missing, refused or holds something unreadable simply means no recents.
 */
export const readRecentPersonPlaces = (): PersonPlaceResponseDto[] => {
  try {
    const raw = localStorage.getItem(RECENT_PERSON_PLACES_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as PersonPlaceResponseDto[]) : [];
  } catch {
    return [];
  }
};

/** Moves `place` to the front of the recent people's places, keeping the newest ten. */
export const rememberPersonPlace = (place: PersonPlaceResponseDto) => {
  const recent = [place, ...readRecentPersonPlaces().filter((other) => other.detailId !== place.detailId)].slice(
    0,
    MAX_RECENT_PERSON_PLACES,
  );
  try {
    localStorage.setItem(RECENT_PERSON_PLACES_KEY, JSON.stringify(recent));
  } catch {
    // Not remembered this time; picking the place still works.
  }
};

/**
 * The people's places to offer before anything is typed: those of the people in the asset first,
 * then the `recent` ones not already listed. Other people's places are left out.
 *
 * `rows` is the server's blank search, which lists every current place. A recent place is shown as
 * the server now has it; one the server no longer lists as current is dropped, since it was deleted
 * or ended. A former place was never in the blank search, so its remembered copy is shown.
 */
export const orderBlankPersonPlaces = (
  rows: LocationSearchResultDto[],
  detectedPeople: Set<string>,
  recent: PersonPlaceResponseDto[],
): LocationSearchResultDto[] => {
  const places = rows.flatMap((row) =>
    row.type === LocationSearchResultType.Person && row.person ? [row.person] : [],
  );
  const byDetail = new Map(places.map((place) => [place.detailId, place]));
  const detected = places.filter((place) => detectedPeople.has(place.personId));
  const shown = new Set(detected.map((place) => place.detailId));
  const recentPlaces = recent
    .filter((place) => !shown.has(place.detailId))
    .map((place) => byDetail.get(place.detailId) ?? (place.isCurrent ? undefined : place))
    .filter((place): place is PersonPlaceResponseDto => place !== undefined)
    .slice(0, MAX_RECENT_PERSON_PLACES);

  return [...detected, ...recentPlaces].map((person) => ({ type: LocationSearchResultType.Person, person }));
};
