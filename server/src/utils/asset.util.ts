import { BadRequestException } from '@nestjs/common';
import _ from 'lodash';
import { DateTime } from 'luxon';
import { GeneratedImageType, StorageCore } from 'src/cores/storage.core';
import { AssetFile } from 'src/database';
import { BulkIdErrorReason, BulkIdResponseDto } from 'src/dtos/asset-ids.response.dto';
import { UploadFieldName } from 'src/dtos/asset-media.dto';
import { AuthDto } from 'src/dtos/auth.dto';
import { AssetFileType, AssetType, AssetVisibility, JobName, Permission } from 'src/enum';
import { AuthRequest } from 'src/middleware/auth.guard';
import { AccessRepository } from 'src/repositories/access.repository';
import { AssetRepository } from 'src/repositories/asset.repository';
import { EventRepository } from 'src/repositories/event.repository';
import { JobRepository } from 'src/repositories/job.repository';
import { PartnerRepository } from 'src/repositories/partner.repository';
import { IBulkAsset, ImmichFile, UploadFile, UploadRequest } from 'src/types';
import { checkAccess } from 'src/utils/access';
import { updateLockedColumns } from 'src/utils/database';

export const getAssetFile = (files: AssetFile[], type: AssetFileType | GeneratedImageType) => {
  return files.find((file) => file.type === type);
};

export const getAssetFiles = (files: AssetFile[]) => ({
  fullsizeFile: getAssetFile(files, AssetFileType.FullSize),
  previewFile: getAssetFile(files, AssetFileType.Preview),
  thumbnailFile: getAssetFile(files, AssetFileType.Thumbnail),
  sidecarFile: getAssetFile(files, AssetFileType.Sidecar),
});

export const addAssets = async (
  auth: AuthDto,
  repositories: { access: AccessRepository; bulk: IBulkAsset },
  dto: { parentId: string; assetIds: string[] },
) => {
  const { access, bulk } = repositories;
  const existingAssetIds = await bulk.getAssetIds(dto.parentId, dto.assetIds);
  const notPresentAssetIds = dto.assetIds.filter((id) => !existingAssetIds.has(id));
  const allowedAssetIds = await checkAccess(access, {
    auth,
    permission: Permission.AssetShare,
    ids: notPresentAssetIds,
  });

  const results: BulkIdResponseDto[] = [];
  for (const assetId of dto.assetIds) {
    const hasAsset = existingAssetIds.has(assetId);
    if (hasAsset) {
      results.push({ id: assetId, success: false, error: BulkIdErrorReason.DUPLICATE });
      continue;
    }

    const hasAccess = allowedAssetIds.has(assetId);
    if (!hasAccess) {
      results.push({ id: assetId, success: false, error: BulkIdErrorReason.NO_PERMISSION });
      continue;
    }

    existingAssetIds.add(assetId);
    results.push({ id: assetId, success: true });
  }

  const newAssetIds = results.filter(({ success }) => success).map(({ id }) => id);
  if (newAssetIds.length > 0) {
    await bulk.addAssetIds(dto.parentId, newAssetIds);
  }

  return results;
};

export const removeAssets = async (
  auth: AuthDto,
  repositories: { access: AccessRepository; bulk: IBulkAsset },
  dto: { parentId: string; assetIds: string[]; canAlwaysRemove: Permission },
) => {
  const { access, bulk } = repositories;

  // check if the user can always remove from the parent album, memory, etc.
  const canAlwaysRemove = await checkAccess(access, { auth, permission: dto.canAlwaysRemove, ids: [dto.parentId] });
  const existingAssetIds = await bulk.getAssetIds(dto.parentId, dto.assetIds);
  const allowedAssetIds = canAlwaysRemove.has(dto.parentId)
    ? existingAssetIds
    : await checkAccess(access, { auth, permission: Permission.AssetShare, ids: existingAssetIds });

  const results: BulkIdResponseDto[] = [];
  for (const assetId of dto.assetIds) {
    const hasAsset = existingAssetIds.has(assetId);
    if (!hasAsset) {
      results.push({ id: assetId, success: false, error: BulkIdErrorReason.NOT_FOUND });
      continue;
    }

    const hasAccess = allowedAssetIds.has(assetId);
    if (!hasAccess) {
      results.push({ id: assetId, success: false, error: BulkIdErrorReason.NO_PERMISSION });
      continue;
    }

    existingAssetIds.delete(assetId);
    results.push({ id: assetId, success: true });
  }

  const removedIds = results.filter(({ success }) => success).map(({ id }) => id);
  if (removedIds.length > 0) {
    await bulk.removeAssetIds(dto.parentId, removedIds);
  }

  return results;
};

export type PartnerIdOptions = {
  userId: string;
  repository: PartnerRepository;
  /** only include partners with `inTimeline: true` */
  timelineEnabled?: boolean;
};
export const getMyPartnerIds = async ({ userId, repository, timelineEnabled }: PartnerIdOptions) => {
  const partnerIds = new Set<string>();
  const partners = await repository.getAll(userId);
  for (const partner of partners) {
    // ignore deleted users
    if (!partner.sharedBy || !partner.sharedWith) {
      continue;
    }

    // wrong direction
    if (partner.sharedWithId !== userId) {
      continue;
    }

    if (timelineEnabled && !partner.inTimeline) {
      continue;
    }

    partnerIds.add(partner.sharedById);
  }

  return [...partnerIds];
};

export type AssetHookRepositories = { asset: AssetRepository; event: EventRepository };

export const onBeforeLink = async (
  { asset: assetRepository, event: eventRepository }: AssetHookRepositories,
  { userId, livePhotoVideoId }: { userId: string; livePhotoVideoId: string },
) => {
  const motionAsset = await assetRepository.getById(livePhotoVideoId);
  if (!motionAsset) {
    throw new BadRequestException('Live photo video not found');
  }
  if (motionAsset.type !== AssetType.Video) {
    throw new BadRequestException('Live photo video must be a video');
  }
  if (motionAsset.ownerId !== userId) {
    throw new BadRequestException('Live photo video does not belong to the user');
  }

  if (motionAsset && motionAsset.visibility === AssetVisibility.Timeline) {
    await assetRepository.update({ id: livePhotoVideoId, visibility: AssetVisibility.Hidden });
    await eventRepository.emit('AssetHide', { assetId: motionAsset.id, userId });
  }
};

export const onBeforeUnlink = async (
  { asset: assetRepository }: AssetHookRepositories,
  { livePhotoVideoId }: { livePhotoVideoId: string },
) => {
  const motion = await assetRepository.getById(livePhotoVideoId);
  if (!motion) {
    return null;
  }

  if (StorageCore.isAndroidMotionPath(motion.originalPath)) {
    throw new BadRequestException('Cannot unlink Android motion photos');
  }

  return motion;
};

export const onAfterUnlink = async (
  { asset: assetRepository, event: eventRepository }: AssetHookRepositories,
  { userId, livePhotoVideoId, visibility }: { userId: string; livePhotoVideoId: string; visibility: AssetVisibility },
) => {
  await assetRepository.update({ id: livePhotoVideoId, visibility });
  await eventRepository.emit('AssetShow', { assetId: livePhotoVideoId, userId });
};

export function mapToUploadFile(file: ImmichFile): UploadFile {
  return {
    uuid: file.uuid,
    checksum: file.checksum,
    originalPath: file.path,
    originalName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
    size: file.size,
  };
}

export const asUploadRequest = (request: AuthRequest, file: Express.Multer.File): UploadRequest => {
  return {
    auth: request.user || null,
    body: request.body,
    fieldName: file.fieldname as UploadFieldName,
    file: mapToUploadFile(file as ImmichFile),
  };
};

export const updateAssetExif = async (
  repositories: { asset: AssetRepository; job: JobRepository },
  dto: {
    id: string;
    description?: string;
    dateTimeOriginal?: string;
    latitude?: number;
    longitude?: number;
    rating?: number;
    noLocation?: boolean;
  },
) => {
  const { id, description, dateTimeOriginal, latitude, longitude, rating, noLocation } = dto;

  // Mark No Location: clear all location data, set the marker, and lock the coordinates so a
  // future metadata re-scan cannot resurrect GPS from the original file and flip the asset back.
  if (noLocation === true) {
    await repositories.asset.upsertExif(
      updateLockedColumns({
        assetId: id,
        latitude: null,
        longitude: null,
        city: null,
        state: null,
        country: null,
        noLocation: true,
      }),
      { lockedPropertiesBehavior: 'append' },
    );
    await repositories.job.queue({ name: JobName.SidecarWrite, data: { id } });
    return;
  }

  // Unassign: clear the marker and unlock the coordinates so a re-scan can legitimately re-derive them.
  if (noLocation === false && latitude === undefined && longitude === undefined) {
    await repositories.asset.clearNoLocation([id]);
    await repositories.job.queue({ name: JobName.SidecarWrite, data: { id } });
    return;
  }

  const extractedTimeZone = dateTimeOriginal ? DateTime.fromISO(dateTimeOriginal, { setZone: true }).zone : undefined;
  const writes = _.omitBy(
    {
      description,
      dateTimeOriginal,
      timeZone: extractedTimeZone?.type === 'fixed' ? extractedTimeZone.name : undefined,
      latitude,
      longitude,
      rating,
      // Assigning real coordinates always clears the No Location marker.
      noLocation: latitude !== undefined || longitude !== undefined ? false : undefined,
    },
    _.isUndefined,
  );

  if (Object.keys(writes).length > 0) {
    await repositories.asset.upsertExif(
      updateLockedColumns({
        assetId: id,
        ...writes,
      }),
      { lockedPropertiesBehavior: 'append' },
    );
    await repositories.job.queue({ name: JobName.SidecarWrite, data: { id } });
  }
};
