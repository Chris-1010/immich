import ChangeLocation from '$lib/components/shared-components/change-location.svelte';
import { lastChosenLocation } from '$lib/stores/asset-editor.store';
import {
  getPersonGenders,
  getSavedLocations,
  LocationSearchResultType,
  PersonDetailDatePrecision,
  PersonDetailKind,
  searchLocations,
  type LocationSearchResultDto,
  type PersonPlaceResponseDto,
} from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getPersonGenders: vi.fn(),
  getSavedLocations: vi.fn(),
  searchLocations: vi.fn(),
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

// The real map pulls in maplibre, which has no canvas to draw on here and is beside the point.
vi.mock('$lib/components/shared-components/map/map.svelte', () => ({
  default: () => ({ addClipMapMarker: () => {} }),
}));

describe('ChangeLocation', () => {
  beforeEach(() => {
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
});
