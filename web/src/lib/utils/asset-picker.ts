import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
import AssetPickerModal from '$lib/modals/AssetPickerModal.svelte';
import type { TimelineDateTime } from '$lib/utils/timeline-util';
import { getAssetInfo } from '@immich/sdk';
import { modalManager } from '@immich/ui';
import { DateTime } from 'luxon';

/**
 * Opens a timeline of the user's photos and resolves to the one clicked, or undefined if the picker
 * is closed. `withLocation` limits it to photos that have coordinates; `initialDate` (a local date
 * and time) opens it at the photos taken around then instead of the newest.
 */
export const pickAsset = (options: { withLocation?: boolean; initialDate?: TimelineDateTime } = {}) =>
  modalManager.show(AssetPickerModal, options) as Promise<TimelineAsset | undefined>;

/**
 * A local date and time for opening the picker, from a `datetime-local` value or an asset's
 * `localDateTime` (an ISO string whose UTC fields hold the local time). Undefined if unreadable.
 */
export const toPickerDate = (localDateTime: string | undefined): TimelineDateTime | undefined => {
  if (!localDateTime) {
    return undefined;
  }
  const date = DateTime.fromISO(localDateTime, { zone: 'UTC' });
  return date.isValid ? date.toObject() : undefined;
};

/**
 * The date, time and time zone of an asset, read the same way the details panel shows them: the
 * original date in the recorded time zone where there is one, otherwise in the browser's zone,
 * falling back to the file's creation date.
 */
export const getAssetDateTime = async (id: string): Promise<{ date: DateTime; timeZone?: string }> => {
  const { exifInfo, fileCreatedAt } = await getAssetInfo({ id });
  const timeZone = exifInfo?.timeZone ?? undefined;
  const original = exifInfo?.dateTimeOriginal;
  if (original) {
    return { date: DateTime.fromISO(original, timeZone ? { zone: timeZone } : {}), timeZone };
  }
  return { date: DateTime.fromISO(fileCreatedAt) };
};
