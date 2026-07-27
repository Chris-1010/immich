import { authenticate } from '$lib/utils/auth';
import { getRelatedPeople } from '@immich/sdk';
import type { PageLoad } from './$types';

export const load = (async ({ params, url }) => {
  await authenticate(url);

  const relatedPeople = await getRelatedPeople({ id: params.personId });

  return {
    relatedPeople,
  };
}) satisfies PageLoad;
