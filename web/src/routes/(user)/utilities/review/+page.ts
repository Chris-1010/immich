import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { getReviewItems } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async ({ url }) => {
  await authenticate(url);
  const $t = await getFormatter();
  const items = await getReviewItems();

  return {
    items,
    meta: {
      title: $t('images_pending_review'),
    },
  };
}) satisfies PageLoad;
