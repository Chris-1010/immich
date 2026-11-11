import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AssetStatus, AssetVisibility, JobName, ReviewDecision } from 'src/enum';
import { ReviewItem } from 'src/repositories/review.repository';
import { ReviewService } from 'src/services/review.service';
import { authStub } from 'test/fixtures/auth.stub';
import { newTestService, ServiceMocks } from 'test/utils';

const item = (overrides: Partial<ReviewItem> = {}): ReviewItem => ({
  assetId: 'asset-1',
  decision: ReviewDecision.Undecided,
  edits: {},
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

describe(ReviewService.name, () => {
  let sut: ReviewService;
  let mocks: ServiceMocks;

  beforeEach(() => {
    ({ sut, mocks } = newTestService(ReviewService));
  });

  describe('update', () => {
    it('should refuse an asset that is not pending review', async () => {
      mocks.access.asset.checkOwnerAccess.mockResolvedValue(new Set(['asset-1']));
      mocks.review.get.mockResolvedValue(undefined);

      await expect(sut.update(authStub.user1, 'asset-1', { decision: ReviewDecision.Keep })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(mocks.review.update).not.toHaveBeenCalled();
    });

    it('should record a decision without touching the asset', async () => {
      mocks.access.asset.checkOwnerAccess.mockResolvedValue(new Set(['asset-1']));
      mocks.review.get.mockResolvedValue(item());
      mocks.review.update.mockResolvedValue(item({ decision: ReviewDecision.Delete }));

      await expect(sut.update(authStub.user1, 'asset-1', { decision: ReviewDecision.Delete })).resolves.toMatchObject({
        assetId: 'asset-1',
        decision: ReviewDecision.Delete,
      });
      expect(mocks.review.update).toHaveBeenCalledWith('asset-1', { decision: ReviewDecision.Delete });
      expect(mocks.asset.update).not.toHaveBeenCalled();
      expect(mocks.asset.upsertExif).not.toHaveBeenCalled();
    });
  });

  describe('finish', () => {
    it('should refuse while anything is undecided', async () => {
      mocks.review.getAll.mockResolvedValue([
        item({ assetId: 'asset-1', decision: ReviewDecision.Keep }),
        item({ assetId: 'asset-2' }),
      ]);

      await expect(sut.finish(authStub.user1)).rejects.toBeInstanceOf(BadRequestException);
      expect(mocks.asset.update).not.toHaveBeenCalled();
      expect(mocks.asset.updateAll).not.toHaveBeenCalled();
    });

    it('should refuse when nothing is pending', async () => {
      mocks.review.getAll.mockResolvedValue([]);
      await expect(sut.finish(authStub.user1)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('should keep and delete according to each decision', async () => {
      mocks.review.getAll.mockResolvedValue([
        item({ assetId: 'asset-1', decision: ReviewDecision.Keep, edits: { description: 'Beach day' } }),
        item({ assetId: 'asset-2', decision: ReviewDecision.Delete, edits: { description: 'Never applied' } }),
      ]);
      mocks.asset.getById.mockResolvedValue({
        id: 'asset-1',
        ownerId: 'user-id',
        originalPath: '/data/review/user-id/as/se/asset-1.jpg',
      } as any);
      mocks.asset.update.mockResolvedValue({} as any);
      mocks.asset.upsertExif.mockResolvedValue();
      mocks.asset.updateAll.mockResolvedValue();
      mocks.review.delete.mockResolvedValue();
      mocks.review.touchForSync.mockResolvedValue();

      await expect(sut.finish(authStub.user1)).resolves.toEqual({ kept: 1, deleted: 1 });

      const uploadPath = expect.stringMatching(/\/data\/upload\/user-id\/as\/se\/asset-1\.jpg$/);
      expect(mocks.storage.rename).toHaveBeenCalledWith('/data/review/user-id/as/se/asset-1.jpg', uploadPath);
      expect(mocks.asset.update).toHaveBeenCalledWith({
        id: 'asset-1',
        originalPath: uploadPath,
        visibility: AssetVisibility.Timeline,
      });
      expect(mocks.asset.upsertExif).toHaveBeenCalledTimes(1);
      expect(mocks.asset.upsertExif).toHaveBeenCalledWith(
        expect.objectContaining({ assetId: 'asset-1', description: 'Beach day' }),
        expect.anything(),
      );
      expect(mocks.review.delete).toHaveBeenCalledWith(['asset-1']);

      expect(mocks.asset.updateAll).toHaveBeenCalledWith(['asset-2'], {
        deletedAt: expect.any(Date),
        status: AssetStatus.Deleted,
      });
      expect(mocks.job.queueAll).toHaveBeenCalledWith([
        { name: JobName.AssetDelete, data: { id: 'asset-2', deleteOnDisk: true } },
      ]);
    });
  });
});
