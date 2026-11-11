<script lang="ts">
  import { getAssetThumbnailUrl } from '$lib/utils';
  import { ReviewDecision } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiCheck, mdiImageOutline, mdiTrashCanOutline } from '@mdi/js';
  import { onDestroy } from 'svelte';

  interface Props {
    assetId: string;
    decision: ReviewDecision;
    selected: boolean;
    i: number;
    onclick: () => void;
  }

  let { assetId, decision, selected, i, onclick }: Props = $props();

  // A fresh upload has no thumbnail until the server has made one, so keep asking for a while.
  const RETRY_MS = 3000;
  const MAX_RETRIES = 20;
  let attempt = $state(0);
  let failed = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onError = () => {
    failed = true;
    if (attempt < MAX_RETRIES) {
      timer = setTimeout(() => {
        attempt++;
      }, RETRY_MS);
    }
  };

  onDestroy(() => clearTimeout(timer));
</script>

<button
  type="button"
  data-index={i}
  class="relative size-20 shrink-0 overflow-hidden rounded-xl bg-gray-200 outline-offset-2 transition dark:bg-immich-dark-gray {selected
    ? 'outline-4 outline-amber-400'
    : 'opacity-90 hover:opacity-100'}"
  {onclick}
>
  {#key attempt}
    <img
      src={getAssetThumbnailUrl({ id: assetId, cacheKey: attempt > 0 ? String(attempt) : undefined })}
      alt=""
      class="size-full object-cover {failed ? 'invisible' : ''}"
      draggable="false"
      onload={() => (failed = false)}
      onerror={onError}
    />
  {/key}
  {#if failed}
    <span class="absolute inset-0 flex items-center justify-center text-gray-400">
      <Icon icon={mdiImageOutline} size="28" />
    </span>
  {/if}
  {#if decision === ReviewDecision.Keep}
    <span class="absolute end-1 top-1 rounded-md bg-green-700 p-0.5 text-white">
      <Icon icon={mdiCheck} size="16" />
    </span>
  {:else if decision === ReviewDecision.Delete}
    <span class="absolute inset-x-0 bottom-0 h-1 bg-red-600"></span>
    <span class="absolute end-1 top-1 rounded-md bg-red-600 p-0.5 text-white">
      <Icon icon={mdiTrashCanOutline} size="16" />
    </span>
  {/if}
</button>
