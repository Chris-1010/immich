import { resolvePinName } from '$lib/utils/contact-fields';
import { reverseGeocode } from '@immich/sdk';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  reverseGeocode: vi.fn(),
}));

describe('resolvePinName', () => {
  beforeEach(() => vi.clearAllMocks());

  it('prefers the name of what was picked, without a lookup', async () => {
    await expect(resolvePinName(53.32, -6.26, 'Rathmines')).resolves.toBe('Rathmines');
    expect(reverseGeocode).not.toHaveBeenCalled();
  });

  it('falls back to City, Country from the reverse geocode', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue([{ city: 'Dublin', state: 'Leinster', country: 'Ireland' }]);
    await expect(resolvePinName(53.32, -6.26)).resolves.toBe('Dublin, Ireland');
    expect(reverseGeocode).toHaveBeenCalledWith({ lat: 53.32, lon: -6.26 });
  });

  it('treats a blank picked name as none', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue([{ city: 'Dublin', state: null, country: 'Ireland' }]);
    await expect(resolvePinName(53.32, -6.26, '  ')).resolves.toBe('Dublin, Ireland');
  });

  it('uses whichever half the geocode knows', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue([{ city: null, state: null, country: 'Ireland' }]);
    await expect(resolvePinName(53.32, -6.26)).resolves.toBe('Ireland');
  });

  it('leaves the pin unnamed when the geocode has nothing', async () => {
    vi.mocked(reverseGeocode).mockResolvedValue([]);
    await expect(resolvePinName(0, 0)).resolves.toBeUndefined();

    vi.mocked(reverseGeocode).mockResolvedValue([{ city: null, state: null, country: null }]);
    await expect(resolvePinName(0, 0)).resolves.toBeUndefined();

    vi.mocked(reverseGeocode).mockRejectedValue(new Error('offline'));
    await expect(resolvePinName(0, 0)).resolves.toBeUndefined();
  });
});
