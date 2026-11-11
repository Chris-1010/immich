import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { basename } from 'node:path';
import { StorageCore } from 'src/cores/storage.core';
import { AuthDto } from 'src/dtos/auth.dto';
import {
  mapReviewItem,
  ReviewFinishResponseDto,
  ReviewItemResponseDto,
  ReviewSimilarAssetResponseDto,
  ReviewUpdateDto,
} from 'src/dtos/review.dto';
import { AssetStatus, AssetVisibility, JobName, Permission, ReviewDecision, StorageFolder } from 'src/enum';
import { ReviewItem } from 'src/repositories/review.repository';
import { BaseService } from 'src/services/base.service';
import { JobItem, ReviewEdits } from 'src/types';
import { addAssets, updateAssetExif } from 'src/utils/asset.util';
import { isDuplicateDetectionEnabled } from 'src/utils/misc';

/** How many look-alike library assets to offer for one pending asset. */
const SIMILAR_LIMIT = 6;

@Injectable()
export class ReviewService extends BaseService {
  async getAll(auth: AuthDto): Promise<ReviewItemResponseDto[]> {
    const items = await this.reviewRepository.getAll(auth.user.id);
    return items.map((item) => mapReviewItem(item));
  }

  async update(auth: AuthDto, id: string, dto: ReviewUpdateDto): Promise<ReviewItemResponseDto> {
    await this.requireAccess({ auth, permission: Permission.AssetUpdate, ids: [id] });
    await this.findOrFail(auth, id);

    if (dto.decision === undefined && dto.edits === undefined) {
      throw new BadRequestException('Nothing to update');
    }

    const item = await this.reviewRepository.update(id, {
      ...(dto.decision === undefined ? {} : { decision: dto.decision }),
      ...(dto.edits === undefined ? {} : { edits: dto.edits as ReviewEdits }),
    });

    return mapReviewItem(item);
  }

  /** Library assets that look like the pending asset, closest first. */
  async getSimilar(auth: AuthDto, id: string): Promise<ReviewSimilarAssetResponseDto[]> {
    await this.requireAccess({ auth, permission: Permission.AssetRead, ids: [id] });
    await this.findOrFail(auth, id);

    const { machineLearning } = await this.getConfig({ withCache: true });
    if (!isDuplicateDetectionEnabled(machineLearning)) {
      return [];
    }

    const asset = await this.assetJobRepository.getForSearchDuplicatesJob(id);
    if (!asset?.embedding) {
      return [];
    }

    // The search only ever returns library assets, since it is limited to the default visibilities.
    const matches = await this.duplicateRepository.search({
      assetId: asset.id,
      embedding: asset.embedding,
      maxDistance: machineLearning.duplicateDetection.maxDistance,
      type: asset.type,
      userIds: [auth.user.id],
    });

    return matches.slice(0, SIMILAR_LIMIT).map(({ assetId, distance }) => ({ assetId, distance: Number(distance) }));
  }

  /**
   * Commit every decision: kept assets get their staged edits applied and join the library, and
   * assets decided Delete are permanently removed. Refused while anything is still undecided.
   */
  async finish(auth: AuthDto): Promise<ReviewFinishResponseDto> {
    const items = await this.reviewRepository.getAll(auth.user.id);
    if (items.length === 0) {
      throw new BadRequestException('There is nothing pending review');
    }

    const undecided = items.filter((item) => item.decision === ReviewDecision.Undecided).length;
    if (undecided > 0) {
      throw new BadRequestException(`${undecided} pending asset(s) still need a decision`);
    }

    const kept = items.filter((item) => item.decision === ReviewDecision.Keep);
    const deleted = items.filter((item) => item.decision === ReviewDecision.Delete);

    for (const item of kept) {
      await this.keep(auth, item);
    }

    await this.delete(deleted.map((item) => item.assetId));

    return { kept: kept.length, deleted: deleted.length };
  }

  private async findOrFail(auth: AuthDto, id: string) {
    const item = await this.reviewRepository.get(auth.user.id, id);
    if (!item) {
      throw new NotFoundException('Pending asset not found');
    }
    return item;
  }

  private async keep(auth: AuthDto, { assetId: id, edits }: ReviewItem) {
    const asset = await this.assetRepository.getById(id);
    if (!asset) {
      return;
    }

    // Move the original into upload/ first, so nothing below runs against a file still in review/.
    const uploadPath = StorageCore.getNestedPath(StorageFolder.Upload, asset.ownerId, basename(asset.originalPath));
    if (asset.originalPath !== uploadPath) {
      this.storageCore.ensureFolders(uploadPath);
      await this.storageRepository.rename(asset.originalPath, uploadPath);
    }

    await this.assetRepository.update({
      id,
      originalPath: uploadPath,
      visibility: AssetVisibility.Timeline,
      ...(edits.isFavorite === undefined ? {} : { isFavorite: edits.isFavorite }),
    });

    await updateAssetExif(
      { asset: this.assetRepository, job: this.jobRepository },
      {
        id,
        description: edits.description,
        dateTimeOriginal: edits.dateTimeOriginal,
        latitude: edits.latitude,
        longitude: edits.longitude,
        rating: edits.rating,
        noLocation: edits.noLocation,
      },
    );

    await this.applyAlbums(auth, id, edits.albumIds ?? []);
    await this.applyFaces(auth, id, edits.faces ?? []);

    await this.reviewRepository.delete([id]);

    // Rows written while the asset was pending were held back from sync; touch them so they go out now.
    await this.reviewRepository.touchForSync(id);

    const jobs: JobItem[] = [
      { name: JobName.StorageTemplateMigrationSingle, data: { id, source: 'upload' } },
      { name: JobName.AssetDetectDuplicates, data: { id } },
    ];
    await this.jobRepository.queueAll(jobs);
  }

  private async applyAlbums(auth: AuthDto, id: string, albumIds: string[]) {
    if (albumIds.length === 0) {
      return;
    }

    const allowed = await this.checkAccess({ auth, permission: Permission.AlbumAssetCreate, ids: albumIds });
    for (const albumId of allowed) {
      const results = await addAssets(
        auth,
        { access: this.accessRepository, bulk: this.albumRepository },
        { parentId: albumId, assetIds: [id] },
      );

      if (results.some(({ success }) => success)) {
        const album = await this.albumRepository.getById(albumId, { withAssets: false });
        await this.albumRepository.update(albumId, {
          id: albumId,
          updatedAt: new Date(),
          albumThumbnailAssetId: album?.albumThumbnailAssetId ?? id,
        });
      }
    }
  }

  private async applyFaces(auth: AuthDto, id: string, faces: Array<{ faceId: string; personId: string }>) {
    if (faces.length === 0) {
      return;
    }

    const allowedPeople = await this.checkAccess({
      auth,
      permission: Permission.PersonUpdate,
      ids: faces.map(({ personId }) => personId),
    });

    const needFeaturePhoto = new Set<string>();
    for (const { faceId, personId } of faces) {
      if (!allowedPeople.has(personId)) {
        continue;
      }

      const face = await this.personRepository.getFaceById(faceId).catch(() => null);
      if (!face || face.assetId !== id) {
        continue;
      }

      const previous = face.person;
      await this.personRepository.reassignFace(faceId, personId);

      const person = await this.personRepository.getById(personId);
      if (person && !person.faceAssetId) {
        needFeaturePhoto.add(personId);
      }
      if (previous && previous.id !== personId && previous.faceAssetId === faceId) {
        needFeaturePhoto.add(previous.id);
      }
    }

    const jobs: JobItem[] = [];
    for (const personId of needFeaturePhoto) {
      const face = await this.personRepository.getRandomFace(personId);
      if (face) {
        await this.personRepository.update({ id: personId, faceAssetId: face.id });
        jobs.push({ name: JobName.PersonGenerateThumbnail, data: { id: personId } });
      }
    }
    await this.jobRepository.queueAll(jobs);
  }

  private async delete(ids: string[]) {
    if (ids.length === 0) {
      return;
    }

    // Hide them at once; the delete job then removes the rows and every file, original included.
    await this.assetRepository.updateAll(ids, { deletedAt: new Date(), status: AssetStatus.Deleted });
    await this.jobRepository.queueAll(
      ids.map((id) => ({ name: JobName.AssetDelete, data: { id, deleteOnDisk: true } })),
    );
  }
}
