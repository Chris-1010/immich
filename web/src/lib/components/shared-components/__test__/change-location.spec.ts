import ChangeLocation from '$lib/components/shared-components/change-location.svelte';
import { lastChosenLocation } from '$lib/stores/asset-editor.store';
import { getSavedLocations, searchLocations } from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { get } from 'svelte/store';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getSavedLocations: vi.fn(),
  searchLocations: vi.fn(),
}));

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
});
