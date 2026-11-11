import {
  ReviewDecision,
  type AssetFaceWithoutPersonResponseDto,
  type AssetResponseDto,
  type PersonResponseDto,
  type PersonWithFacesResponseDto,
  type ReviewEditsDto,
  type ReviewItemResponseDto,
} from '@immich/sdk';
import { DateTime } from 'luxon';

/** Drop keys whose value is `undefined`, so a cleared edit is not sent or stored. */
export const cleanEdits = (edits: ReviewEditsDto): ReviewEditsDto =>
  Object.fromEntries(Object.entries(edits).filter(([, value]) => value !== undefined)) as ReviewEditsDto;

/** Merge a patch into staged edits; an `undefined` value in the patch clears that edit. */
export const mergeEdits = (edits: ReviewEditsDto, patch: ReviewEditsDto): ReviewEditsDto =>
  cleanEdits({ ...edits, ...patch });

/**
 * The index to move to after a decision or a skip: the next undecided item after `from`, wrapping
 * round to the start. Falls back to the next item along when nothing else is undecided, and to
 * `from` itself when it is the only item.
 */
export const nextIndex = (items: ReviewItemResponseDto[], from: number): number => {
  const count = items.length;
  for (let step = 1; step < count; step++) {
    const index = (from + step) % count;
    if (items[index].decision === ReviewDecision.Undecided) {
      return index;
    }
  }

  return count > 0 ? Math.min(from + 1, count - 1) : 0;
};

export const firstUndecidedIndex = (items: ReviewItemResponseDto[]) => {
  const index = items.findIndex((item) => item.decision === ReviewDecision.Undecided);
  return Math.max(index, 0);
};

/**
 * The asset as it will be once kept: staged edits laid over what the server holds, so the detail
 * panel shows the pending changes. `locationLabel` names the second line shown under staged
 * coordinates, which have no place name until the asset is kept and reverse-geocoded.
 */
export const withStagedEdits = (
  asset: AssetResponseDto,
  edits: ReviewEditsDto,
  facePeople: Record<string, PersonResponseDto>,
  locationLabel: string,
): AssetResponseDto => {
  const exifInfo = { ...asset.exifInfo };

  if (edits.description !== undefined) {
    exifInfo.description = edits.description;
  }

  if (edits.rating !== undefined) {
    exifInfo.rating = edits.rating;
  }

  if (edits.dateTimeOriginal) {
    const date = DateTime.fromISO(edits.dateTimeOriginal, { setZone: true });
    if (date.isValid) {
      exifInfo.dateTimeOriginal = date.toISO();
      exifInfo.timeZone = date.zoneName;
    }
  }

  if (edits.noLocation) {
    Object.assign(exifInfo, { latitude: null, longitude: null, city: null, state: null, country: null });
    exifInfo.noLocation = true;
  } else if (edits.latitude !== undefined && edits.longitude !== undefined) {
    Object.assign(exifInfo, {
      latitude: edits.latitude,
      longitude: edits.longitude,
      city: `${edits.latitude.toFixed(5)}, ${edits.longitude.toFixed(5)}`,
      state: null,
      country: locationLabel,
    });
    exifInfo.noLocation = false;
  }

  return {
    ...asset,
    isFavorite: edits.isFavorite ?? asset.isFavorite,
    exifInfo,
    ...withStagedPeople(asset, facePeople),
  };
};

const withStagedPeople = (asset: AssetResponseDto, facePeople: Record<string, PersonResponseDto>) => {
  if (Object.keys(facePeople).length === 0) {
    return {};
  }

  let unassignedFaces: AssetFaceWithoutPersonResponseDto[] = [...(asset.unassignedFaces ?? [])];
  const people: PersonWithFacesResponseDto[] = (asset.people ?? []).map((person) => ({
    ...person,
    faces: [...person.faces],
  }));

  for (const [faceId, person] of Object.entries(facePeople)) {
    let face = unassignedFaces.find(({ id }) => id === faceId);
    if (face) {
      unassignedFaces = unassignedFaces.filter(({ id }) => id !== faceId);
    } else {
      for (const holder of people) {
        const found = holder.faces.find(({ id }) => id === faceId);
        if (found) {
          face = found;
          holder.faces = holder.faces.filter(({ id }) => id !== faceId);
        }
      }
    }

    if (!face) {
      continue;
    }

    const target = people.find(({ id }) => id === person.id);
    if (target) {
      target.faces.push(face);
    } else {
      people.push({ ...person, faces: [face] });
    }
  }

  return { people: people.filter((person) => person.faces.length > 0), unassignedFaces };
};
