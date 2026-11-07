import { sdkMock } from '$lib/__mocks__/sdk.mock';
import PersonHeaderCarousel from '$lib/components/faces-page/person-header-carousel.svelte';
import { AssetTypeEnum, AssetVisibility, type AssetResponseDto } from '@immich/sdk';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { tick } from 'svelte';

const photos = (count: number, prefix = 'asset') =>
  Array.from({ length: count }, (_, index) => ({ id: `${prefix}-${index}` }) as AssetResponseDto);

const deferred = () => {
  let resolve!: (assets: AssetResponseDto[]) => void;
  const promise = new Promise<AssetResponseDto[]>((done) => (resolve = done));
  return { promise, resolve };
};

const band = () => screen.queryByTestId('person-header-carousel');
const images = (element: HTMLElement) => [...element.querySelectorAll('img')];

/** Lets a resolved or rejected search reach the component and render. */
const settle = async () => {
  await Promise.resolve();
  await tick();
};

describe('PersonHeaderCarousel', () => {
  beforeEach(() => {
    sdkMock.searchRandom.mockReset();
    sdkMock.getAssetThumbnailPath.mockImplementation((id) => `/assets/${id}/thumbnail`);
  });

  it('makes no request and renders no band at three or fewer assets', async () => {
    const { container } = render(PersonHeaderCarousel, { personId: 'a', assetCount: 3 });
    await settle();

    expect(sdkMock.searchRandom).not.toHaveBeenCalled();
    expect(band()).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('requests timeline images for the person and renders above three', async () => {
    sdkMock.searchRandom.mockResolvedValue(photos(4));

    render(PersonHeaderCarousel, { personId: 'a', assetCount: 4 });

    await waitFor(() => expect(band()).toBeInTheDocument());
    expect(sdkMock.searchRandom).toHaveBeenCalledExactlyOnceWith({
      randomSearchDto: {
        personIds: ['a'],
        type: AssetTypeEnum.Image,
        visibility: AssetVisibility.Timeline,
        withDeleted: false,
        size: 20,
      },
    });
    expect(band()).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders nothing when the count was mostly videos and three or fewer images came back', async () => {
    sdkMock.searchRandom.mockResolvedValue(photos(3));

    render(PersonHeaderCarousel, { personId: 'a', assetCount: 10 });
    await settle();

    expect(sdkMock.searchRandom).toHaveBeenCalledOnce();
    expect(band()).toBeNull();
  });

  it('doubles a row that is a whole number of repeats, so the loop has no visible seam', async () => {
    sdkMock.searchRandom.mockResolvedValue(photos(5));

    render(PersonHeaderCarousel, { personId: 'a', assetCount: 5 });
    await waitFor(() => expect(band()).toBeInTheDocument());

    const sources = images(band()!).map((image) => image.getAttribute('src'));
    expect(sources).toHaveLength(50);
    expect(sources.slice(25)).toEqual(sources.slice(0, 25));
    expect(sources.slice(5, 10)).toEqual(sources.slice(0, 5));
  });

  it('ignores a slow response for a person who is no longer current', async () => {
    const previous = deferred();
    const current = deferred();
    sdkMock.searchRandom.mockReturnValueOnce(previous.promise as never).mockReturnValueOnce(current.promise as never);

    const { rerender } = render(PersonHeaderCarousel, { personId: 'a', assetCount: 5 });
    await rerender({ personId: 'b', assetCount: 5 });
    expect(sdkMock.searchRandom).toHaveBeenCalledTimes(2);

    current.resolve(photos(4, 'current'));
    await waitFor(() => expect(band()).toBeInTheDocument());

    previous.resolve(photos(4, 'previous'));
    await settle();

    const sources = images(band()!).map((image) => image.getAttribute('src'));
    expect(sources.some((source) => source?.includes('current-0'))).toBe(true);
    expect(sources.some((source) => source?.includes('previous-0'))).toBe(false);
  });

  it('drops the previous band as soon as the person changes', async () => {
    sdkMock.searchRandom.mockResolvedValueOnce(photos(4)).mockReturnValueOnce(deferred().promise as never);

    const { rerender } = render(PersonHeaderCarousel, { personId: 'a', assetCount: 5 });
    await waitFor(() => expect(band()).toBeInTheDocument());

    await rerender({ personId: 'b', assetCount: 5 });

    expect(band()).toBeNull();
  });

  it('renders nothing when the fetch fails', async () => {
    sdkMock.searchRandom.mockRejectedValue(new Error('nope'));

    render(PersonHeaderCarousel, { personId: 'a', assetCount: 5 });
    await settle();

    expect(sdkMock.searchRandom).toHaveBeenCalledOnce();
    expect(band()).toBeNull();
  });

  it('fades a photo in only once it has loaded', async () => {
    sdkMock.searchRandom.mockResolvedValue(photos(4));

    render(PersonHeaderCarousel, { personId: 'a', assetCount: 4 });
    await waitFor(() => expect(band()).toBeInTheDocument());

    const [first] = images(band()!);
    expect(first).toHaveClass('opacity-0');

    await fireEvent.load(first);

    expect(first).toHaveClass('opacity-100');
  });
});
