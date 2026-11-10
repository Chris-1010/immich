<script lang="ts">
  import Timeline from '$lib/components/timeline/Timeline.svelte';
  import { TimelineManager } from '$lib/managers/timeline-manager/timeline-manager.svelte';
  import {
    findClosestGroupForDate,
    getMonthGroupByDate,
  } from '$lib/managers/timeline-manager/internal/search-support.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { AssetInteraction } from '$lib/stores/asset-interaction.svelte';
  import type { TimelineDateTime } from '$lib/utils/timeline-util';
  import { AssetVisibility, TimeBucketField } from '@immich/sdk';
  import { Modal, ModalBody } from '@immich/ui';
  import { mdiImageSearchOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    /** Limit the timeline to assets that have coordinates, archived ones included. */
    withLocation?: boolean;
    /** Open the timeline scrolled to the asset closest to this local date and time. */
    initialDate?: TimelineDateTime;
    onClose: (asset?: TimelineAsset) => void;
  }

  let { withLocation = false, initialDate, onClose }: Props = $props();

  let timelineManager = $state<TimelineManager>() as TimelineManager;
  const assetInteraction = new AssetInteraction();

  // Bucketed by date taken whatever the main timeline is sorted by, so the initial date lands on
  // photos taken around then. The located list leaves visibility open so archived photos count, and
  // the server refuses partners' photos alongside archived ones, so it is the user's own only.
  const options = $derived(
    withLocation
      ? { withCoordinates: true, hasCoordinates: true, timeBucketField: TimeBucketField.DateTaken }
      : {
          visibility: AssetVisibility.Timeline,
          withStacked: true,
          withPartners: true,
          timeBucketField: TimeBucketField.DateTaken,
        },
  );

  let scrolledToInitialDate = false;

  // Once the months are known and the grid has a size, jump to the photo closest to the initial date.
  $effect(() => {
    if (
      scrolledToInitialDate ||
      !initialDate ||
      !timelineManager?.isInitialized ||
      timelineManager.viewportHeight === 0 ||
      timelineManager.months.length === 0
    ) {
      return;
    }
    scrolledToInitialDate = true;
    void scrollToDate(initialDate);
  });

  // Mirrors the timeline's own scroll-after-filter: layout deferral is switched off while the target
  // month loads, or its positions are stale and the scroll lands on a blank gap; the sliding window is
  // then re-synced so the months now in view load and render. The closest month that exists is used
  // when the date has none (common when only located photos are listed).
  const scrollToDate = async (date: TimelineDateTime) => {
    timelineManager.isScrollingOnLoad = true;
    try {
      const monthGroup =
        getMonthGroupByDate(timelineManager, date) ?? findClosestGroupForDate(timelineManager.months, date);
      if (!monthGroup) {
        return;
      }
      await timelineManager.loadMonthGroup(monthGroup.yearMonth, { cancelable: false });
      const asset = monthGroup.findClosest(date);
      const position = asset && monthGroup.findAssetAbsolutePosition(asset.id);
      timelineManager.scrollTo(position ? Math.max(0, position.top - timelineManager.headerHeight) : monthGroup.top);
      timelineManager.updateSlidingWindow();
    } finally {
      timelineManager.isScrollingOnLoad = false;
    }
  };
</script>

<Modal title={$t('select_photo')} icon={mdiImageSearchOutline} size="full" onClose={() => onClose()}>
  <ModalBody>
    <!-- The timeline sizes itself to its container, so the container takes the screen less the header. -->
    <div class="relative h-[calc(100dvh-6rem)] w-full">
      <Timeline
        enableRouting={false}
        bind:timelineManager
        {options}
        {assetInteraction}
        isSelectionMode
        singleSelect
        withStacked={!withLocation}
        onSelect={(asset) => onClose(asset)}
      />
    </div>
  </ModalBody>
</Modal>
