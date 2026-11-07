<script lang="ts">
  import { getAssetThumbnailUrl } from '$lib/utils';
  import { AssetMediaSize, AssetTypeEnum, AssetVisibility, searchRandom, type AssetResponseDto } from '@immich/sdk';
  import { SvelteSet } from 'svelte/reactivity';

  interface Props {
    personId: string;
    /** The person's asset count, videos included, which spares a request that cannot qualify. */
    assetCount: number;
  }

  let { personId, assetCount }: Props = $props();

  /** The band only appears above this many photos. */
  const MINIMUM_PHOTOS_EXCLUSIVE = 3;
  const FETCH_SIZE = 20;
  /** Enough tiles that one row outruns a very wide window, which a seamless loop depends on. */
  const MINIMUM_TILES = 24;
  /** Scaling the duration by row length keeps the speed the same however many tiles there are. */
  const SECONDS_PER_TILE = 8;

  let photos = $state<AssetResponseDto[]>([]);
  const loadedIds = new SvelteSet<string>();

  const isEligible = $derived(assetCount > MINIMUM_PHOTOS_EXCLUSIVE);
  // The asset count includes videos, so what actually came back has the last word. A random search
  // returns the whole set when it is under the requested size, which makes this an exact count.
  const isVisible = $derived(photos.length > MINIMUM_PHOTOS_EXCLUSIVE);
  // Whole repeats of the set, so the seam between the two rows looks like any other join.
  const tiles = $derived.by(() => {
    const repeats = Math.ceil(MINIMUM_TILES / Math.max(photos.length, 1));
    return Array.from({ length: repeats }, () => photos).flat();
  });

  $effect(() => {
    const id = personId;
    photos = [];

    if (!isEligible) {
      return;
    }

    let isCurrent = true;
    searchRandom({
      randomSearchDto: {
        personIds: [id],
        type: AssetTypeEnum.Image,
        visibility: AssetVisibility.Timeline,
        withDeleted: false,
        size: FETCH_SIZE,
      },
    }).then(
      (assets) => {
        if (isCurrent) {
          photos = assets;
        }
      },
      () => {
        // Decorative only: a failed fetch leaves the header as it is, with no toast.
      },
    );

    return () => {
      isCurrent = false;
    };
  });
</script>

<!-- Forced left-to-right because the loop's -50% only meets its own start from that side. The scrim
     is the page's own background, solid at both edges so the band blends into the page above and
     below it and the photos show strongest through the vertical middle. -->
{#if isVisible}
  <div
    class="pointer-events-none absolute -inset-x-2 inset-y-0 -z-1 overflow-hidden select-none md:-inset-x-6"
    aria-hidden="true"
    dir="ltr"
    data-testid="person-header-carousel"
  >
    <div class="drift flex h-full w-max" style:animation-duration="{tiles.length * SECONDS_PER_TILE}s">
      {#each [...tiles, ...tiles] as asset, index (index)}
        <img
          src={getAssetThumbnailUrl({ id: asset.id, size: AssetMediaSize.Thumbnail, cacheKey: asset.thumbhash })}
          alt=""
          draggable="false"
          decoding="async"
          class="me-1 h-full w-48 shrink-0 object-cover transition-opacity duration-700 {loadedIds.has(asset.id)
            ? 'opacity-100'
            : 'opacity-0'}"
          onload={() => loadedIds.add(asset.id)}
        />
      {/each}
    </div>
    <div class="absolute inset-0 bg-linear-to-b from-light via-light/75 to-light"></div>
  </div>
{/if}

<style>
  /* Held in a no-preference query so reduced motion gets the same row, still. Transform only, so the
     compositor runs it with no frame loop. */
  @media (prefers-reduced-motion: no-preference) {
    .drift {
      animation: drift linear infinite;
    }
  }

  @keyframes drift {
    to {
      transform: translateX(-50%);
    }
  }
</style>
