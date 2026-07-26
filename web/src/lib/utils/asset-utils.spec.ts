import { timelineAssetFactory } from '@test-data/factories/asset-factory';
import { getStack, type AssetResponseDto, type StackResponseDto } from '@immich/sdk';
import { vi } from 'vitest';
import {
  canCopyImageToClipboard,
  getAssetFilename,
  getAssetIdsWithStackChildren,
  getFilenameExtension,
} from './asset-utils';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getStack: vi.fn(),
}));

describe('get file extension from filename', () => {
  it('returns the extension without including the dot', () => {
    expect(getFilenameExtension('filename.txt')).toEqual('txt');
  });

  it('takes the last file extension and ignores the rest', () => {
    expect(getFilenameExtension('filename.txt.pdf')).toEqual('pdf');
    expect(getFilenameExtension('filename.txt.pdf.jpg')).toEqual('jpg');
  });

  it('returns an empty string when no file extension is found', () => {
    expect(getFilenameExtension('filename')).toEqual('');
    expect(getFilenameExtension('filename.')).toEqual('');
    expect(getFilenameExtension('filename..')).toEqual('');
    expect(getFilenameExtension('.filename')).toEqual('');
  });

  it('returns the extension from a filepath', () => {
    expect(getFilenameExtension('/folder/file.txt')).toEqual('txt');
    expect(getFilenameExtension('./folder/file.txt')).toEqual('txt');
    expect(getFilenameExtension('~/folder/file.txt')).toEqual('txt');
    expect(getFilenameExtension('./folder/.file.txt')).toEqual('txt');
    expect(getFilenameExtension('/folder.with.dots/file.txt')).toEqual('txt');
  });
});

describe('get asset filename', () => {
  it('returns the filename including file extension', () => {
    for (const { asset, result } of [
      {
        asset: {
          originalFileName: 'filename',
          originalPath: '/data/library/test/2016/2016-08-30/filename.jpg',
        },
        result: 'filename.jpg',
      },
      {
        asset: {
          originalFileName: 'new-filename',
          originalPath: '/data/library/89d14e47-a40d-4cae-a347-a914cdef1f22/2016/2016-08-30/filename.jpg',
        },
        result: 'new-filename.jpg',
      },
      {
        asset: {
          originalFileName: 'new-filename.txt',
          originalPath: '/data/library/test/2016/2016-08-30/filename.txt.jpg',
        },
        result: 'new-filename.txt.jpg',
      },
    ]) {
      expect(getAssetFilename(asset as AssetResponseDto)).toEqual(result);
    }
  });
});

describe('copy image to clipboard', () => {
  // This test is dubious, as it totally on the environment where the test is run which is mocked.
  it('should allow copy image to clipboard', () => {
    expect(canCopyImageToClipboard()).toEqual(true);
  });
});

describe('getAssetIdsWithStackChildren', () => {
  const mockGetStack = vi.mocked(getStack);

  beforeEach(() => {
    mockGetStack.mockReset();
  });

  it('returns only the selected ids when nothing is stacked', async () => {
    const assets = [
      timelineAssetFactory.build({ id: 'a', stack: null }),
      timelineAssetFactory.build({ id: 'b', stack: null }),
    ];

    const ids = await getAssetIdsWithStackChildren(assets);

    expect(ids).toEqual(['a', 'b']);
    expect(mockGetStack).not.toHaveBeenCalled();
  });

  it('expands a collapsed stack to include its children', async () => {
    mockGetStack.mockResolvedValue({
      id: 'stack-1',
      primaryAssetId: 'primary',
      assets: [{ id: 'primary' }, { id: 'child-1' }, { id: 'child-2' }] as AssetResponseDto[],
    } as StackResponseDto);

    const assets = [
      timelineAssetFactory.build({ id: 'primary', stack: { id: 'stack-1', primaryAssetId: 'primary', assetCount: 3 } }),
    ];

    const ids = await getAssetIdsWithStackChildren(assets);

    expect(mockGetStack).toHaveBeenCalledWith({ id: 'stack-1' });
    expect(ids).toEqual(['primary', 'child-1', 'child-2']);
  });

  it('does not fetch a stack that only contains a single asset', async () => {
    const assets = [
      timelineAssetFactory.build({ id: 'solo', stack: { id: 'stack-2', primaryAssetId: 'solo', assetCount: 1 } }),
    ];

    const ids = await getAssetIdsWithStackChildren(assets);

    expect(ids).toEqual(['solo']);
    expect(mockGetStack).not.toHaveBeenCalled();
  });

  it('fetches each distinct stack once and deduplicates ids', async () => {
    mockGetStack.mockImplementation(({ id }) =>
      Promise.resolve({
        id,
        primaryAssetId: `${id}-primary`,
        assets: [{ id: `${id}-primary` }, { id: `${id}-child` }] as AssetResponseDto[],
      } as StackResponseDto),
    );

    const assets = [
      timelineAssetFactory.build({ id: 'plain', stack: null }),
      timelineAssetFactory.build({ id: 's1-primary', stack: { id: 's1', primaryAssetId: 's1-primary', assetCount: 2 } }),
      timelineAssetFactory.build({ id: 's2-primary', stack: { id: 's2', primaryAssetId: 's2-primary', assetCount: 2 } }),
    ];

    const ids = await getAssetIdsWithStackChildren(assets);

    expect(mockGetStack).toHaveBeenCalledTimes(2);
    expect(ids).toEqual(['plain', 's1-primary', 's2-primary', 's1-child', 's2-child']);
  });
});
