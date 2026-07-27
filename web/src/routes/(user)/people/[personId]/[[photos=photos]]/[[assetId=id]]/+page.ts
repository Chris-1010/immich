import { authenticate } from '$lib/utils/auth';
import { getAssetInfoFromParam } from '$lib/utils/navigation';
import type { PageLoad } from './$types';

export const load = (async ({ params, url }) => {
  await authenticate(url);

  const asset = await getAssetInfoFromParam(params);

  return {
    asset,
  };
}) satisfies PageLoad;
