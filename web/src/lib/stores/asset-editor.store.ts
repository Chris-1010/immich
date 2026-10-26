import CropTool from '$lib/components/asset-viewer/editor/crop-tool/crop-tool.svelte';
import {
  createSavedLocation,
  createSavedLocations,
  deleteSavedLocation,
  getSavedLocations,
  updateSavedLocation,
  type SavedLocationCreateDto,
  type SavedLocationResponseDto,
} from '@immich/sdk';
import { mdiCropRotate } from '@mdi/js';
import { derived, get, writable } from 'svelte/store';

//---------crop
export const cropSettings = writable<CropSettings>({ x: 0, y: 0, width: 100, height: 100 });
export const cropImageSize = writable([1000, 1000]);
export const cropImageScale = writable(1);
export const cropAspectRatio = writable<CropAspectRatio>('free');
export const cropSettingsChanged = writable<boolean>(false);
//---------rotate
export const rotateDegrees = writable<number>(0);
export const normaizedRorateDegrees = derived(rotateDegrees, (v) => {
  const newAngle = v % 360;
  return newAngle < 0 ? newAngle + 360 : newAngle;
});
export const changedOriention = derived(normaizedRorateDegrees, () => get(normaizedRorateDegrees) % 180 > 0);
//-----other
export const showCancelConfirmDialog = writable<boolean | CallableFunction>(false);
export const lastChosenLocation = writable<{ lng: number; lat: number } | null>(null);

export type SavedLocation = SavedLocationResponseDto;

/**
 * Where saved locations lived before they moved to the server. Read once, by `importLegacy`, and
 * cleared only after the server has taken them in.
 */
export const SAVED_LOCATIONS_KEY = 'immich_saved_locations';

/**
 * Whatever the browser still holds under the old key. Storage can be missing (SSR), blocked
 * (private windows, site data cleared) or hold junk; every one of those reads as nothing to import.
 */
function readLegacySavedLocations(): SavedLocationCreateDto[] {
  try {
    const stored = localStorage.getItem(SAVED_LOCATIONS_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? (parsed as SavedLocationCreateDto[]).filter(
          (entry) =>
            typeof entry?.name === 'string' &&
            typeof entry.latitude === 'number' &&
            typeof entry.longitude === 'number',
        )
      : [];
  } catch {
    return [];
  }
}

function clearLegacySavedLocations() {
  try {
    localStorage.removeItem(SAVED_LOCATIONS_KEY);
  } catch {
    // A key that cannot be removed is sent again next time; the bulk import skips what it already has.
  }
}

/** The server's own order, so a location added or renamed here lands where a reload would put it. */
const byName = (a: SavedLocation, b: SavedLocation) =>
  a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.createdAt.localeCompare(b.createdAt);

/**
 * The user's saved locations, held on the server. The list starts empty and fills when `load` is
 * called (the location picker does this on open, without waiting on it), so nothing here blocks a
 * render. Mutations go to the server first and touch the list only once it has answered, so the
 * list never shows something the server refused; callers catch and report the error.
 */
function createSavedLocationsStore() {
  const { subscribe, set, update } = writable<SavedLocation[]>([]);

  /**
   * The one-off move out of browser storage. The bulk import answers with the full list, so a
   * successful import doubles as the load. The old key is cleared only after the server has the
   * entries; on failure it is kept for the next open, which the import's idempotency makes safe.
   * Returns false when there was nothing to import or the import failed, leaving the load to
   * `getSavedLocations`.
   */
  async function importLegacy(): Promise<boolean> {
    const locations = readLegacySavedLocations();
    if (locations.length === 0) {
      return false;
    }

    try {
      set(await createSavedLocations({ savedLocationsBulkCreateDto: { locations } }));
    } catch {
      return false;
    }

    clearLegacySavedLocations();
    return true;
  }

  async function load() {
    if (!(await importLegacy())) {
      set(await getSavedLocations());
    }
  }

  async function add(location: SavedLocationCreateDto) {
    const created = await createSavedLocation({ savedLocationCreateDto: location });
    update((locations) => [...locations, created].sort(byName));
    return created;
  }

  async function rename(id: string, name: string) {
    const updated = await updateSavedLocation({ id, savedLocationUpdateDto: { name } });
    update((locations) => locations.map((location) => (location.id === id ? updated : location)).sort(byName));
    return updated;
  }

  async function remove(id: string) {
    await deleteSavedLocation({ id });
    update((locations) => locations.filter((location) => location.id !== id));
  }

  return { subscribe, load, add, rename, remove };
}

export const savedLocations = createSavedLocationsStore();

export const editTypes = [
  {
    name: 'crop',
    icon: mdiCropRotate,
    component: CropTool,
    changesFlag: cropSettingsChanged,
  },
];

export function closeEditorCofirm(closeCallback: CallableFunction) {
  if (get(hasChanges)) {
    showCancelConfirmDialog.set(closeCallback);
  } else {
    closeCallback();
  }
}

export const hasChanges = derived(
  editTypes.map((t) => t.changesFlag),
  ($flags) => {
    return $flags.some(Boolean);
  },
);

export function resetGlobalCropStore() {
  cropSettings.set({ x: 0, y: 0, width: 100, height: 100 });
  cropImageSize.set([1000, 1000]);
  cropImageScale.set(1);
  cropAspectRatio.set('free');
  cropSettingsChanged.set(false);
  showCancelConfirmDialog.set(false);
  rotateDegrees.set(0);
}

export type CropAspectRatio =
  | '1:1'
  | '16:9'
  | '4:3'
  | '3:2'
  | '7:5'
  | '9:16'
  | '3:4'
  | '2:3'
  | '5:7'
  | 'free'
  | 'reset';

export type CropSettings = {
  x: number;
  y: number;
  width: number;
  height: number;
};
