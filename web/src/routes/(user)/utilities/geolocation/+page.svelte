<script lang="ts">
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import ChangeLocation, { type ChangeLocationResult } from '$lib/components/shared-components/change-location.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { AssetAction } from '$lib/constants';
  import { authManager } from '$lib/managers/auth-manager.svelte';
  import type { DayGroup } from '$lib/managers/timeline-manager/day-group.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { AssetInteraction } from '$lib/stores/asset-interaction.svelte';
  import { cancelMultiselect } from '$lib/utils/asset-utils';
  import { setQueryValue } from '$lib/utils/navigation';
  import { toTimelineAsset } from '$lib/utils/timeline-util';
  import { AssetVisibility, getAssetInfo, getStack, updateAssets } from '@immich/sdk';
  import { Button, LoadingSpinner, modalManager, Text } from '@immich/ui';
  import { mdiMapMarkerMultipleOutline, mdiMapMarkerOffOutline, mdiPencilOutline, mdiSelectRemove } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let isLoading = $state(false);
  let assetInteraction = new AssetInteraction();
  let location = $state<{ latitude: number; longitude: number }>({ latitude: 0, longitude: 0 });
  let locationUpdated = $state(false);
  let filterNoGps = $state(false);
  // When set, Apply marks the selection No Location instead of writing the picked coordinates.
  let pendingNoLocation = $state(false);

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  let options = $derived({
    visibility: AssetVisibility.Timeline,
    withStacked: true,
    withPartners: true,
    withCoordinates: true,
    withoutCoordinates: filterNoGps || undefined,
  });

  const applyLocationUpdate = async () => {
    const idGroups = await Promise.all(
      assetInteraction.selectedAssets.map(async (asset) => {
        if (asset.stack) {
          const stack = await getStack({ id: asset.stack.id });
          return stack.assets.map((a) => a.id);
        }
        return [asset.id];
      }),
    );

    await updateAssets({
      assetBulkUpdateDto: {
        ids: idGroups.flat(),
        ...(pendingNoLocation
          ? { noLocation: true }
          : { latitude: location?.latitude ?? undefined, longitude: location?.longitude ?? undefined }),
      },
    });

    const updatedAssets = await Promise.all(
      assetInteraction.selectedAssets.map(async (asset) => {
        const updatedAsset = await getAssetInfo({ ...authManager.params, id: asset.id });
        return toTimelineAsset(updatedAsset);
      }),
    );

    timelineManager.upsertAssets(updatedAssets);
    handleDeselectAll();
  };

  const handleUpdate = () => applyLocationUpdate();

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      event.preventDefault();
    }
    if (event.key === 'Escape' && assetInteraction.selectionActive) {
      cancelMultiselect(assetInteraction);
    }
    if (event.key === 'Enter' && assetInteraction.selectedAssets.length > 0) {
      const target = event.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && target.tagName !== 'BUTTON') {
        event.preventDefault();
        void applyLocationUpdate();
      }
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === 'Shift') {
      event.preventDefault();
    }
  };

  const handleDeselectAll = () => {
    cancelMultiselect(assetInteraction);
  };

  const handlePickOnMap = async () => {
    const result: ChangeLocationResult | undefined = await modalManager.show(ChangeLocation, {
      point: {
        lat: location.latitude,
        lng: location.longitude,
      },
    });
    if (!result) {
      return;
    }

    if (result.type === 'noLocation') {
      pendingNoLocation = true;
      return;
    }

    pendingNoLocation = false;
    location = { latitude: result.point.lat, longitude: result.point.lng };
  };
  const handleEscape = () => {
    if (assetInteraction.selectionActive) {
      assetInteraction.clearMultiselect();
      return;
    }
  };

  const hasGps = (asset: TimelineAsset) => {
    return !!asset.latitude && !!asset.longitude;
  };

  const handleThumbnailClick = (
    asset: TimelineAsset,
    timelineManager: TimelineManager,
    dayGroup: DayGroup,
    onClick: (
      timelineManager: TimelineManager,
      assets: TimelineAsset[],
      groupTitle: string,
      asset: TimelineAsset,
    ) => void,
  ) => {
    if (hasGps(asset)) {
      locationUpdated = true;
      setTimeout(() => {
        locationUpdated = false;
      }, 1500);
      pendingNoLocation = false;
      location = { latitude: asset.latitude!, longitude: asset.longitude! };
      void setQueryValue('at', asset.id);
    } else {
      onClick(timelineManager, dayGroup.getAssets(), dayGroup.groupTitle, asset);
    }
  };
</script>

<svelte:document onkeydown={onKeyDown} onkeyup={onKeyUp} />

<UserPageLayout title={data.meta.title} scrollbar={true}>
  {#snippet buttons()}
    <div class="flex gap-2 justify-end place-items-center">
      <Text class="hidden md:block text-xs mr-4 text-dark/50">{$t('geolocation_instruction_location')}</Text>
      <div class="hidden sm:flex border place-items-center place-content-center px-2 py-1 bg-primary/10 rounded-2xl">
        <Text class="hidden md:inline-block text-xs text-gray-500 font-mono mr-5 ml-2 uppercase">
          {$t('selected_gps_coordinates')}
        </Text>
        <Text
          title="latitude, longitude"
          class="rounded-3xl font-mono text-sm text-primary px-2 py-1 transition-all duration-100 ease-in-out {locationUpdated
            ? 'bg-primary/90 text-light font-semibold scale-105'
            : ''}"
          >{pendingNoLocation
            ? $t('no_location')
            : `${location.latitude.toFixed(3)}, ${location.longitude.toFixed(3)}`}</Text
        >
      </div>

      <Button size="small" color="secondary" variant="ghost" leadingIcon={mdiPencilOutline} onclick={handlePickOnMap}>
        <Text class="hidden sm:inline-block">{$t('location_picker_choose_on_map')}</Text>
      </Button>
      <Button
        size="small"
        color={filterNoGps ? 'primary' : 'secondary'}
        variant={filterNoGps ? 'filled' : 'ghost'}
        leadingIcon={mdiMapMarkerOffOutline}
        onclick={() => (filterNoGps = !filterNoGps)}
      >
        <Text class="hidden sm:inline-block">{$t('gps_missing')}</Text>
      </Button>
      <Button
        leadingIcon={mdiSelectRemove}
        size="small"
        color="secondary"
        variant="ghost"
        disabled={!assetInteraction.selectionActive}
        onclick={handleDeselectAll}
      >
        <Text class="hidden sm:inline-block">{$t('unselect_all')}</Text>
      </Button>
      <Button
        leadingIcon={mdiMapMarkerMultipleOutline}
        size="small"
        color="primary"
        disabled={assetInteraction.selectedAssets.length === 0}
        onclick={() => handleUpdate()}
      >
        <Text class="hidden sm:inline-block">
          {$t('apply_count', { values: { count: assetInteraction.selectedAssets.length } })}
        </Text>
      </Button>
    </div>
  {/snippet}

  {#if isLoading}
    <div class="h-full w-full flex items-center justify-center">
      <LoadingSpinner size="giant" />
    </div>
  {/if}

  <Timeline
    isSelectionMode={true}
    enableRouting={true}
    bind:timelineManager
    {options}
    {assetInteraction}
    removeAction={AssetAction.ARCHIVE}
    onEscape={handleEscape}
    withStacked
    onThumbnailClick={handleThumbnailClick}
  >
    {#snippet customThumbnailLayout(asset: TimelineAsset)}
      {#if hasGps(asset)}
        <div class="absolute bottom-1 end-3 px-4 py-1 rounded-xl text-xs transition-colors bg-success text-black">
          {asset.city || $t('gps')}
        </div>
      {:else if asset.noLocation}
        <div class="absolute bottom-1 end-3 px-4 py-1 rounded-xl text-xs transition-colors bg-blue-500 text-light">
          {$t('none')}
        </div>
      {:else}
        <div class="absolute bottom-1 end-3 px-4 py-1 rounded-xl text-xs transition-colors bg-danger text-light">
          {$t('gps_missing')}
        </div>
      {/if}
    {/snippet}
    {#snippet empty()}
      <EmptyPlaceholder text={$t('no_assets_message')} onClick={() => {}} class="mt-10 mx-auto" />
    {/snippet}
  </Timeline>
</UserPageLayout>
