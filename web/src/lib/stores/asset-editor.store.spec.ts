import { SAVED_LOCATIONS_KEY, savedLocations } from '$lib/stores/asset-editor.store';
import { createSavedLocations, getSavedLocations, type SavedLocationResponseDto } from '@immich/sdk';
import { get } from 'svelte/store';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  createSavedLocations: vi.fn(),
  getSavedLocations: vi.fn(),
}));

const saved = (name: string): SavedLocationResponseDto => ({
  id: `id-${name}`,
  name,
  latitude: 53.32,
  longitude: -6.26,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const legacy = [{ name: 'Rathmines', latitude: 53.32, longitude: -6.26 }];

describe('savedLocations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('loads from the server when the browser holds nothing to import', async () => {
    vi.mocked(getSavedLocations).mockResolvedValue([saved('Office')]);

    await savedLocations.load();

    expect(createSavedLocations).not.toHaveBeenCalled();
    expect(get(savedLocations)).toEqual([saved('Office')]);
  });

  it('imports what the browser held and clears the old key once the server has it', async () => {
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(legacy));
    vi.mocked(createSavedLocations).mockResolvedValue([saved('Rathmines')]);

    await savedLocations.load();

    expect(createSavedLocations).toHaveBeenCalledWith({ savedLocationsBulkCreateDto: { locations: legacy } });
    expect(getSavedLocations).not.toHaveBeenCalled();
    expect(localStorage.getItem(SAVED_LOCATIONS_KEY)).toBeNull();
    expect(get(savedLocations)).toEqual([saved('Rathmines')]);
  });

  it('keeps the old key when the import fails, and still loads the list', async () => {
    localStorage.setItem(SAVED_LOCATIONS_KEY, JSON.stringify(legacy));
    vi.mocked(createSavedLocations).mockRejectedValue(new Error('offline'));
    vi.mocked(getSavedLocations).mockResolvedValue([saved('Office')]);

    await savedLocations.load();

    expect(localStorage.getItem(SAVED_LOCATIONS_KEY)).toBe(JSON.stringify(legacy));
    expect(get(savedLocations)).toEqual([saved('Office')]);
  });

  it('treats junk under the old key as nothing to import', async () => {
    localStorage.setItem(SAVED_LOCATIONS_KEY, '{not json');
    vi.mocked(getSavedLocations).mockResolvedValue([]);

    await savedLocations.load();

    expect(createSavedLocations).not.toHaveBeenCalled();
  });
});
