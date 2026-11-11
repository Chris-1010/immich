<script lang="ts">
  import { getAssetThumbnailUrl } from '$lib/utils';
  import { AssetMediaSize } from '@immich/sdk';
  import { Icon, LoadingSpinner } from '@immich/ui';
  import { mdiImageBrokenVariant } from '@mdi/js';
  import { onDestroy } from 'svelte';

  interface Props {
    assetId: string;
    alt: string;
    element?: HTMLImageElement;
  }

  let { assetId, alt, element = $bindable() }: Props = $props();

  // A fresh upload has no preview until the server has made one, so keep asking for a while and
  // show a spinner meanwhile rather than a broken image.
  const RETRY_MS = 2000;
  const MAX_RETRIES = 30;
  let attempt = $state(0);
  let loaded = $state(false);
  let gaveUp = $state(false);
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onError = () => {
    if (attempt >= MAX_RETRIES) {
      gaveUp = true;
      return;
    }
    timer = setTimeout(() => attempt++, RETRY_MS);
  };

  onDestroy(() => clearTimeout(timer));
</script>

{#key attempt}
  <img
    bind:this={element}
    src={getAssetThumbnailUrl({
      id: assetId,
      size: AssetMediaSize.Preview,
      cacheKey: attempt > 0 ? String(attempt) : undefined,
    })}
    {alt}
    class="max-h-full max-w-full object-contain {loaded ? '' : 'invisible absolute'}"
    draggable="false"
    onload={() => (loaded = true)}
    onerror={onError}
  />
{/key}
{#if !loaded}
  <div class="flex flex-col items-center gap-3 text-gray-500 dark:text-gray-400">
    {#if gaveUp}
      <Icon icon={mdiImageBrokenVariant} size="48" />
    {:else}
      <LoadingSpinner size="giant" />
    {/if}
  </div>
{/if}
