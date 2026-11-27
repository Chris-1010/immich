import { StorageCore } from 'src/cores/storage.core';
import { vitest } from 'vitest';

vitest.mock('src/constants', () => ({
  IWorker: 'IWorker',
}));

describe('StorageCore', () => {
  describe('isImmichPath', () => {
    beforeAll(() => {
      StorageCore.setMediaLocation('/photos');
    });

    it('should return true for APP_MEDIA_LOCATION path', () => {
      const immichPath = '/photos';
      expect(StorageCore.isImmichPath(immichPath)).toBe(true);
    });

    it('should return true for paths within the APP_MEDIA_LOCATION', () => {
      const immichPath = '/photos/new/';
      expect(StorageCore.isImmichPath(immichPath)).toBe(true);
    });

    it('should return false for paths outside the APP_MEDIA_LOCATION and same starts', () => {
      const nonImmichPath = '/photos_new';
      expect(StorageCore.isImmichPath(nonImmichPath)).toBe(false);
    });

    it('should return false for paths outside the APP_MEDIA_LOCATION', () => {
      const nonImmichPath = '/some/other/path';
      expect(StorageCore.isImmichPath(nonImmichPath)).toBe(false);
    });
  });

  describe('getCastVideoPath', () => {
    beforeAll(() => {
      StorageCore.setMediaLocation('/photos');
    });

    it('should place the cast copy next to the encoded video', () => {
      const asset = { id: 'abcdef12-0000-0000-0000-000000000000', ownerId: 'user-1' };
      expect(StorageCore.getCastVideoPath(asset)).toBe(
        '/photos/encoded-video/user-1/ab/cd/abcdef12-0000-0000-0000-000000000000-cast.mp4',
      );
      expect(StorageCore.getEncodedVideoPath(asset)).toBe(
        '/photos/encoded-video/user-1/ab/cd/abcdef12-0000-0000-0000-000000000000.mp4',
      );
    });
  });
});
