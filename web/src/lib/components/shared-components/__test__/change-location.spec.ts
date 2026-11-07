import ChangeLocation from '$lib/components/shared-components/change-location.svelte';
import { lastChosenLocation } from '$lib/stores/asset-editor.store';
import {
  deleteSavedLocation,
  getPersonGenders,
  getSavedLocations,
  LocationSearchResultType,
  PersonDetailDatePrecision,
  PersonDetailKind,
  searchLocations,
  updateSavedLocation,
  type LocationSearchResultDto,
  type PersonPlaceResponseDto,
  type SavedLocationResponseDto,
} from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  deleteSavedLocation: vi.fn(),
  getPersonGenders: vi.fn(),
  getSavedLocations: vi.fn(),
  searchLocations: vi.fn(),
  updateSavedLocation: vi.fn(),
}));

const personPlace = (overrides: Partial<PersonPlaceResponseDto> = {}): PersonPlaceResponseDto => ({
  detailId: 'detail-1',
  isCurrent: true,
  key: 'Home',
  kind: PersonDetailKind.Home,
  latitude: 53.31,
  longitude: -6.27,
  personId: 'person-1',
  personIsHidden: false,
  personName: 'Ethan',
  personUpdatedAt: '2026-01-01T00:00:00.000Z',
  since: null,
  sincePrecision: null,
  until: null,
  untilPrecision: null,
  value: 'Rathmines',
  ...overrides,
});

// One of each row type, as the server ranks them.
const searchResults: LocationSearchResultDto[] = [
  {
    type: LocationSearchResultType.Saved,
    saved: {
      id: 'saved-1',
      name: 'Office',
      latitude: 1,
      longitude: 2,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  },
  { type: LocationSearchResultType.Person, person: personPlace() },
  {
    type: LocationSearchResultType.Person,
    person: personPlace({
      detailId: 'detail-2',
      isCurrent: false,
      value: 'Ranelagh',
      until: '2021-01-01',
      untilPrecision: PersonDetailDatePrecision.Year,
    }),
  },
  {
    type: LocationSearchResultType.Place,
    place: { name: 'Dublin', admin1name: 'Leinster', latitude: 53.35, longitude: -6.26 },
  },
];

const search = async (query: string) => {
  await userEvent.type(screen.getByPlaceholderText('search_places'), query);
  await screen.findByText('Office', undefined, { timeout: 3000 });
};

const savedLocation = (overrides: Partial<SavedLocationResponseDto> = {}): SavedLocationResponseDto => ({
  id: 'saved-1',
  name: 'Rathmines',
  latitude: 53.32,
  longitude: -6.26,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const DRAWER_OPEN_KEY = 'immich_saved_locations_drawer_open';

const drawerHandle = () => screen.getByRole('button', { name: /saved_locations/ });

const openDrawer = () => userEvent.click(drawerHandle());

// The real map pulls in maplibre, which has no canvas to draw on here and is beside the point.
vi.mock('$lib/components/shared-components/map/map.svelte', () => ({
  default: () => ({ addClipMapMarker: () => {} }),
}));

describe('ChangeLocation', () => {
  // Outlast bits-ui's 24 ms body-scroll-lock cleanup timer, which otherwise fires after jsdom is torn down.
  afterAll(() => new Promise((resolve) => setTimeout(resolve, 50)));

  beforeEach(() => {
    vi.clearAllMocks();
    lastChosenLocation.set(null);
    localStorage.clear();
    vi.mocked(getSavedLocations).mockResolvedValue([]);
    vi.mocked(searchLocations).mockResolvedValue([]);
    vi.mocked(getPersonGenders).mockResolvedValue([]);
  });

  it('offers No Location for an asset', () => {
    render(ChangeLocation, { onClose: vi.fn() });
    expect(screen.getByText('no_location')).toBeInTheDocument();
  });

  it('hides the asset-only footer action when picking a point', () => {
    render(ChangeLocation, { pointOnly: true, onClose: vi.fn() });
    expect(screen.queryByText('no_location')).not.toBeInTheDocument();
    expect(screen.queryByText('unassign_location')).not.toBeInTheDocument();
  });

  it('remembers the last chosen location for an asset', async () => {
    const onClose = vi.fn();
    render(ChangeLocation, { point: { lat: 1, lng: 2 }, onClose });

    await userEvent.click(screen.getByText('confirm'));

    expect(onClose).toHaveBeenCalledWith(expect.objectContaining({ type: 'coordinates', point: { lat: 1, lng: 2 } }));
    expect(get(lastChosenLocation)).toEqual({ lat: 1, lng: 2 });
  });

  it('returns an existing pin unnamed, and leaves the last chosen location alone, when picking a point', async () => {
    const onClose = vi.fn();
    render(ChangeLocation, { pointOnly: true, point: { lat: 1, lng: 2 }, onClose });

    await userEvent.click(screen.getByText('confirm'));

    expect(onClose).toHaveBeenCalledWith({ type: 'coordinates', point: { lat: 1, lng: 2 }, name: undefined });
    expect(get(lastChosenLocation)).toBeNull();
  });

  it('names the point after the saved location it came from', async () => {
    vi.mocked(getSavedLocations).mockResolvedValue([
      {
        id: 'saved-1',
        name: 'Rathmines',
        latitude: 53.32,
        longitude: -6.26,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    const onClose = vi.fn();
    render(ChangeLocation, { pointOnly: true, onClose });

    await openDrawer();
    await userEvent.click(await screen.findByText('Rathmines'));
    await userEvent.click(screen.getByText('confirm'));

    expect(onClose).toHaveBeenCalledWith({
      type: 'coordinates',
      point: { lat: 53.32, lng: -6.26 },
      name: 'Rathmines',
    });
  });

  it('renders saved, person and place rows from one search', async () => {
    vi.mocked(searchLocations).mockResolvedValue(searchResults);
    render(ChangeLocation, { pointOnly: true, onClose: vi.fn() });

    await search('ra');

    expect(searchLocations).toHaveBeenLastCalledWith({ query: 'ra' });
    expect(screen.getByText('person_place_home · Rathmines')).toBeInTheDocument();
    expect(screen.getByText('person_place_former_home · person_place_until')).toBeInTheDocument();
    expect(screen.getByText('Dublin, Leinster')).toBeInTheDocument();
    // Both of Ethan's rows carry his face.
    expect(document.querySelectorAll('img[src*="/people/person-1/thumbnail"]')).toHaveLength(2);
  });

  it("returns a person's place with its coordinates and value as the name", async () => {
    vi.mocked(searchLocations).mockResolvedValue(searchResults);
    const onClose = vi.fn();
    render(ChangeLocation, { pointOnly: true, onClose });

    await search('ra');
    await userEvent.click(screen.getByText('person_place_home · Rathmines'));
    await userEvent.click(screen.getByText('confirm'));

    expect(onClose).toHaveBeenCalledWith({
      type: 'coordinates',
      point: { lat: 53.31, lng: -6.27 },
      name: 'Rathmines',
    });
  });

  it("offers saved locations and people's current places before anything is typed", async () => {
    vi.mocked(getSavedLocations).mockResolvedValue([searchResults[0].saved!]);
    vi.mocked(searchLocations).mockResolvedValue([searchResults[1]]);
    render(ChangeLocation, { pointOnly: true, onClose: vi.fn() });

    await userEvent.click(screen.getByPlaceholderText('search_places'));

    expect(await screen.findByText('person_place_home · Rathmines')).toBeInTheDocument();
    expect(searchLocations).toHaveBeenCalledWith({});
  });

  describe('saved-locations drawer', () => {
    it('starts collapsed, with the count on its handle', async () => {
      vi.mocked(getSavedLocations).mockResolvedValue([savedLocation()]);
      render(ChangeLocation, { onClose: vi.fn() });

      expect(await screen.findByText('1')).toBeInTheDocument();
      expect(drawerHandle()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByPlaceholderText('filter_places')).not.toBeInTheDocument();
      expect(screen.queryByText('Rathmines')).not.toBeInTheDocument();
    });

    it('remembers being opened and closed', async () => {
      const first = render(ChangeLocation, { onClose: vi.fn() });
      await openDrawer();
      expect(localStorage.getItem(DRAWER_OPEN_KEY)).toBe('true');
      first.unmount();

      render(ChangeLocation, { pointOnly: true, onClose: vi.fn() });
      expect(drawerHandle()).toHaveAttribute('aria-expanded', 'true');
      expect(screen.getByText('no_saved_locations')).toBeInTheDocument();

      await userEvent.click(drawerHandle());
      expect(localStorage.getItem(DRAWER_OPEN_KEY)).toBe('false');
    });

    it('opens collapsed when browser storage is unavailable', () => {
      const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('blocked');
      });
      try {
        render(ChangeLocation, { onClose: vi.fn() });
        expect(drawerHandle()).toHaveAttribute('aria-expanded', 'false');
      } finally {
        getItem.mockRestore();
      }
    });

    it('closes as a sheet on Escape without closing the picker', async () => {
      localStorage.setItem(DRAWER_OPEN_KEY, 'true');
      const onClose = vi.fn();
      render(ChangeLocation, { onClose });

      await userEvent.keyboard('{Escape}');

      expect(drawerHandle()).toHaveAttribute('aria-expanded', 'false');
      expect(onClose).not.toHaveBeenCalled();
    });

    it('closes as a sheet on a click outside it', async () => {
      localStorage.setItem(DRAWER_OPEN_KEY, 'true');
      render(ChangeLocation, { onClose: vi.fn() });

      await userEvent.click(screen.getByRole('button', { name: 'close' }));

      expect(drawerHandle()).toHaveAttribute('aria-expanded', 'false');
    });

    describe('rows', () => {
      beforeEach(() => {
        localStorage.setItem(DRAWER_OPEN_KEY, 'true');
        vi.mocked(getSavedLocations).mockResolvedValue([savedLocation()]);
      });

      it('renames a saved location on Enter', async () => {
        vi.mocked(updateSavedLocation).mockResolvedValue(savedLocation({ name: 'Granny' }));
        render(ChangeLocation, { pointOnly: true, onClose: vi.fn() });

        await userEvent.click(await screen.findByRole('button', { name: 'rename' }));
        const input = screen.getByRole('textbox', { name: 'rename' });
        expect(input).toHaveValue('Rathmines');
        expect(input).toHaveFocus();
        await userEvent.clear(input);
        await userEvent.type(input, '  Granny {Enter}');

        expect(updateSavedLocation).toHaveBeenCalledWith({ id: 'saved-1', savedLocationUpdateDto: { name: 'Granny' } });
        expect(await screen.findByText('Granny')).toBeInTheDocument();
        expect(screen.queryByRole('textbox', { name: 'rename' })).not.toBeInTheDocument();
      });

      it('cancels a rename on Escape, leaving the drawer and picker open', async () => {
        const onClose = vi.fn();
        render(ChangeLocation, { pointOnly: true, onClose });

        await userEvent.click(await screen.findByRole('button', { name: 'rename' }));
        await userEvent.type(screen.getByRole('textbox', { name: 'rename' }), 'xyz{Escape}');

        expect(updateSavedLocation).not.toHaveBeenCalled();
        expect(screen.queryByRole('textbox', { name: 'rename' })).not.toBeInTheDocument();
        expect(screen.getByText('Rathmines')).toBeInTheDocument();
        expect(drawerHandle()).toHaveAttribute('aria-expanded', 'true');
        expect(onClose).not.toHaveBeenCalled();
      });

      it('refuses a blank name', async () => {
        render(ChangeLocation, { pointOnly: true, onClose: vi.fn() });

        await userEvent.click(await screen.findByRole('button', { name: 'rename' }));
        const input = screen.getByRole('textbox', { name: 'rename' });
        await userEvent.clear(input);
        await userEvent.type(input, '   {Enter}');

        expect(updateSavedLocation).not.toHaveBeenCalled();
        expect(input).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'save' })).toBeDisabled();
      });

      it('deletes a saved location', async () => {
        vi.mocked(deleteSavedLocation).mockResolvedValue(undefined as never);
        render(ChangeLocation, { onClose: vi.fn() });

        await userEvent.click(await screen.findByRole('button', { name: 'delete' }));

        expect(deleteSavedLocation).toHaveBeenCalledWith({ id: 'saved-1' });
        expect(await screen.findByText('no_saved_locations')).toBeInTheDocument();
      });
    });
  });
});
