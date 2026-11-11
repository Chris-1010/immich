import type { PersonResponseDto, ReviewEditsDto } from '@immich/sdk';
import { getContext, setContext } from 'svelte';

/**
 * Lets the detail panel edit a pending asset without saving anything to it. When a review page
 * provides this, the panel's editors stage their change here instead of calling the API; the
 * staged edits are applied by the server only if the asset is kept when the review is finished.
 */
export interface ReviewStaging {
  /** Merge a change into the asset's staged edits. An `undefined` value clears that edit. */
  stage: (patch: ReviewEditsDto) => void;
  /** Stage face-to-person assignments, keeping the people so the panel can show them. */
  stageFaces: (assignments: Array<{ faceId: string; person: PersonResponseDto }>) => void;
  /** The person each face is staged to be assigned to, by face id. */
  getStagedFaces: () => Record<string, PersonResponseDto>;
}

const key = Symbol('review-staging');

export const setReviewStaging = (staging: ReviewStaging) => setContext(key, staging);

export const getReviewStaging = () => getContext<ReviewStaging | undefined>(key);
