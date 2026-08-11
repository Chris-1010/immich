import { authenticate } from '$lib/utils/auth';
import { getFormatter } from '$lib/utils/i18n';
import { getPerson, getPersonDetails, getPersonStatistics } from '@immich/sdk';
import type { LayoutLoad } from './$types';

export const load = (async ({ params, url }) => {
  await authenticate(url);

  // Details are loaded here rather than carried on the person itself: they belong to this page, and
  // putting them on `PersonResponseDto` would send every person's details with the people grid.
  const [person, statistics, details] = await Promise.all([
    getPerson({ id: params.personId }),
    getPersonStatistics({ id: params.personId }),
    getPersonDetails({ id: params.personId }),
  ]);
  const $t = await getFormatter();

  return {
    person,
    statistics,
    details,
    meta: {
      title: person.name || $t('person'),
    },
  };
}) satisfies LayoutLoad;
