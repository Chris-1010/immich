<script lang="ts">
  import DetailPanel from '$lib/components/asset-viewer/detail-panel.svelte';
  import UserPageLayout from '$lib/components/layouts/user-page-layout.svelte';
  import ReviewPreview from '$lib/components/review/ReviewPreview.svelte';
  import ReviewThumbnail from '$lib/components/review/ReviewThumbnail.svelte';
  import { AppRoute } from '$lib/constants';
  import AlbumPickerModal from '$lib/modals/AlbumPickerModal.svelte';
  import { photoViewerImgElement } from '$lib/stores/assets-store.svelte';
  import { getAssetThumbnailUrl } from '$lib/utils';
  import { openFileUploadDialog } from '$lib/utils/file-uploader';
  import { handleError } from '$lib/utils/handle-error';
  import { firstUndecidedIndex, mergeEdits, nextIndex, withStagedEdits } from '$lib/utils/review';
  import { setReviewStaging } from '$lib/utils/review-staging';
  import {
    finishReview,
    getAllAlbums,
    getAssetInfo,
    getPerson,
    getReviewItems,
    getReviewSimilar,
    ReviewDecision,
    updateReviewItem,
    type AlbumResponseDto,
    type AssetResponseDto,
    type PersonResponseDto,
    type ReviewEditsDto,
    type ReviewItemResponseDto,
    type ReviewSimilarAssetResponseDto,
  } from '@immich/sdk';
  import { Button, Icon, IconButton, LoadingSpinner, modalManager, toastManager } from '@immich/ui';
  import {
    mdiArrowRight,
    mdiCheck,
    mdiClose,
    mdiFullscreen,
    mdiImageMultipleOutline,
    mdiPlus,
    mdiSkipNext,
    mdiTrashCanOutline,
    mdiUndo,
  } from '@mdi/js';
  import { untrack } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let items = $state<ReviewItemResponseDto[]>(data.items);
  let index = $state(firstUndecidedIndex(data.items));

  /** Decisions already made, newest last, so Undo can walk back through them. */
  let history = $state<Array<{ assetId: string; decision: ReviewDecision }>>([]);

  /** Server copies of the assets, fetched as they come into view. */
  let assets = $state<Record<string, AssetResponseDto>>({});
  /** Staged face assignments per asset, with the people resolved so the panel can show them. */
  let facePeople = $state<Record<string, Record<string, PersonResponseDto>>>({});
  let similar = $state<Record<string, ReviewSimilarAssetResponseDto[]>>({});
  let albums = $state<AlbumResponseDto[]>([]);

  let isUploading = $state(false);
  let isFinishing = $state(false);
  let previewElement = $state<HTMLImageElement>();
  let stageElement = $state<HTMLElement>();
  let stripElement = $state<HTMLElement>();

  const current = $derived(items[index] as ReviewItemResponseDto | undefined);
  const currentAsset = $derived(current ? assets[current.assetId] : undefined);
  const shownAsset = $derived(
    current && currentAsset
      ? withStagedEdits(currentAsset, current.edits, facePeople[current.assetId] ?? {}, $t('review_saved_when_kept'))
      : undefined,
  );
  const stagedAlbums = $derived(
    (current?.edits.albumIds ?? [])
      .map((id) => albums.find((album) => album.id === id))
      .filter((album): album is AlbumResponseDto => !!album),
  );
  const currentSimilar = $derived(current ? (similar[current.assetId] ?? []) : []);

  const keptCount = $derived(items.filter((item) => item.decision === ReviewDecision.Keep).length);
  const deletedCount = $derived(items.filter((item) => item.decision === ReviewDecision.Delete).length);
  const undecidedCount = $derived(items.length - keptCount - deletedCount);

  $effect(() => {
    photoViewerImgElement.set(previewElement ?? null);
    return () => photoViewerImgElement.set(null);
  });

  // Only a change of image triggers loading. Reads inside the loader are untracked, otherwise storing
  // its own results would re-run it in a loop.
  $effect(() => {
    const id = current?.assetId;
    if (id) {
      untrack(() => void loadAsset(id));
    }
  });

  // Keep the current thumbnail in view as the review moves along the strip.
  $effect(() => {
    const thumbnail = stripElement?.querySelector(`[data-index="${index}"]`);
    thumbnail?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  });

  const loadAlbums = async () => {
    try {
      albums = await getAllAlbums({});
    } catch (error) {
      handleError(error, $t('errors.failed_to_load_assets'));
    }
  };

  void loadAlbums();

  const loadAsset = async (id: string) => {
    try {
      if (!assets[id]) {
        assets[id] = await getAssetInfo({ id });
      }

      const item = items.find((candidate) => candidate.assetId === id);
      if (item?.edits.faces?.length && !facePeople[id]) {
        const resolved: Record<string, PersonResponseDto> = {};
        for (const { faceId, personId } of item.edits.faces) {
          resolved[faceId] = await getPerson({ id: personId });
        }
        facePeople[id] = resolved;
      }

    } catch (error) {
      handleError(error, $t('errors.failed_to_load_asset'));
    }

    void loadSimilar(id);
  };

  /**
   * Smart search may not have reached a fresh upload yet, so this is re-asked on every visit until
   * something turns up. The hint is optional, so a failure is not reported.
   */
  const loadSimilar = async (id: string) => {
    if (similar[id]?.length || isFinishing) {
      return;
    }
    try {
      const matches = await getReviewSimilar({ id });
      if (!isFinishing) {
        similar[id] = matches;
      }
    } catch {
      // The asset may have left review in the meantime.
    }
  };

  const replaceItem = (updated: ReviewItemResponseDto) => {
    items = items.map((item) => (item.assetId === updated.assetId ? { ...item, ...updated } : item));
  };

  const saveEdits = async (assetId: string, edits: ReviewEditsDto) => {
    replaceItem({ ...items.find((item) => item.assetId === assetId)!, edits });
    try {
      replaceItem(await updateReviewItem({ id: assetId, reviewUpdateDto: { edits } }));
    } catch (error) {
      handleError(error, $t('errors.cant_apply_changes'));
    }
  };

  setReviewStaging({
    stage: (patch) => {
      if (current) {
        void saveEdits(current.assetId, mergeEdits(current.edits, patch));
      }
    },
    stageFaces: (assignments) => {
      if (!current) {
        return;
      }
      const assetId = current.assetId;
      const resolved = { ...facePeople[assetId] };
      for (const { faceId, person } of assignments) {
        resolved[faceId] = person;
      }
      facePeople[assetId] = resolved;
      const faces = Object.entries(resolved).map(([faceId, person]) => ({ faceId, personId: person.id }));
      void saveEdits(assetId, mergeEdits(current.edits, { faces }));
    },
    getStagedFaces: () => (current ? (facePeople[current.assetId] ?? {}) : {}),
  });

  const setDecision = async (assetId: string, decision: ReviewDecision) => {
    const previous = items.find((item) => item.assetId === assetId);
    if (!previous) {
      return;
    }
    replaceItem({ ...previous, decision });
    try {
      replaceItem(await updateReviewItem({ id: assetId, reviewUpdateDto: { decision } }));
    } catch (error) {
      replaceItem(previous);
      handleError(error, $t('errors.cant_apply_changes'));
    }
  };

  const decide = async (decision: ReviewDecision) => {
    if (!current) {
      return;
    }
    const { assetId, decision: previous } = current;
    history.push({ assetId, decision: previous });
    const from = index;
    await setDecision(assetId, decision);
    index = nextIndex(items, from);
  };

  const skip = () => {
    if (items.length > 0) {
      index = nextIndex(items, index);
    }
  };

  const undo = async () => {
    const last = history.pop();
    if (!last) {
      return;
    }
    const position = items.findIndex((item) => item.assetId === last.assetId);
    if (position === -1) {
      return;
    }
    index = position;
    await setDecision(last.assetId, last.decision);
  };

  const go = (offset: number) => {
    if (items.length > 0) {
      index = Math.min(Math.max(index + offset, 0), items.length - 1);
    }
  };

  const refresh = async () => {
    const assetId = current?.assetId;
    items = await getReviewItems();
    const position = items.findIndex((item) => item.assetId === assetId);
    index = position === -1 ? firstUndecidedIndex(items) : position;
  };

  const handleAddImages = async () => {
    isUploading = true;
    try {
      const ids = await openFileUploadDialog({ isReviewAssets: true });
      const known = new Set(items.map((item) => item.assetId));
      await refresh();
      const pending = new Set(items.map((item) => item.assetId));
      // An upload that comes back with an id that is not newly pending was a byte-identical copy
      // of something already in the library or already pending.
      const skipped = ids.filter((id) => !pending.has(id) || known.has(id)).length;
      if (skipped > 0) {
        toastManager.info($t('review_already_in_library', { values: { count: skipped } }));
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_upload_file'));
    } finally {
      isUploading = false;
    }
  };

  const handleAddToAlbum = async () => {
    if (!current) {
      return;
    }
    const assetId = current.assetId;
    const picked = await modalManager.show(AlbumPickerModal, { shared: false });
    if (!picked || picked.length === 0) {
      return;
    }
    for (const album of picked) {
      if (!albums.some(({ id }) => id === album.id)) {
        albums.push(album);
      }
    }
    const item = items.find((candidate) => candidate.assetId === assetId)!;
    const albumIds = [...new Set([...(item.edits.albumIds ?? []), ...picked.map(({ id }) => id)])];
    await saveEdits(assetId, mergeEdits(item.edits, { albumIds }));
  };

  const handleRemoveAlbum = async (albumId: string) => {
    if (!current) {
      return;
    }
    const albumIds = (current.edits.albumIds ?? []).filter((id) => id !== albumId);
    await saveEdits(
      current.assetId,
      mergeEdits(current.edits, { albumIds: albumIds.length > 0 ? albumIds : undefined }),
    );
  };

  const handleFinish = async () => {
    const confirmed = await modalManager.showDialog({
      title: $t('review_finish'),
      prompt: $t('review_finish_confirmation', { values: { kept: keptCount, deleted: deletedCount } }),
      confirmText: $t('review_finish'),
    });
    if (!confirmed) {
      return;
    }

    isFinishing = true;
    try {
      const { kept, deleted } = await finishReview();
      toastManager.success($t('review_finished', { values: { kept, deleted } }));
      // Empty the list before clearing the caches, so nothing reloads an asset that is no longer pending.
      items = [];
      index = 0;
      history = [];
      assets = {};
      facePeople = {};
      similar = {};
      await refresh();
    } catch (error) {
      handleError(error, $t('errors.cant_apply_changes'));
    } finally {
      isFinishing = false;
    }
  };

  const toggleFullscreen = async () => {
    await (document.fullscreenElement ? document.exitFullscreen() : stageElement?.requestFullscreen());
  };

  const onKeydown = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (
      event.defaultPrevented ||
      target?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]') ||
      event.altKey
    ) {
      return;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      void undo();
      return;
    }
    if (event.ctrlKey || event.metaKey) {
      return;
    }

    switch (event.key) {
      case 'ArrowLeft': {
        go(-1);
        break;
      }
      case 'ArrowRight': {
        go(1);
        break;
      }
      case 'k':
      case 'K': {
        void decide(ReviewDecision.Keep);
        break;
      }
      case 'd':
      case 'D':
      case 'Delete': {
        void decide(ReviewDecision.Delete);
        break;
      }
      case 's':
      case 'S': {
        skip();
        break;
      }
      default: {
        return;
      }
    }
    event.preventDefault();
  };
</script>

<svelte:window onkeydown={onKeydown} />

<UserPageLayout title={data.meta.title} scrollbar={false}>
  {#snippet buttons()}
    <div class="flex gap-2 items-center">
      {#if items.length > 0}
        <span class="text-sm text-gray-500 dark:text-gray-400 hidden md:inline">
          {$t('review_keeping_deleting', { values: { kept: keptCount, deleted: deletedCount } })}
        </span>
      {/if}
      <Button
        leadingIcon={mdiPlus}
        size="small"
        variant="ghost"
        color="secondary"
        loading={isUploading}
        disabled={isUploading}
        title={$t('review_add_images_description')}
        onclick={handleAddImages}
      >
        {$t('review_add_images')}
      </Button>
    </div>
  {/snippet}

  {#if items.length === 0}
    <div class="flex h-full flex-col items-center justify-center gap-4 p-8 text-center dark:text-white">
      <Icon icon={mdiImageMultipleOutline} size="64" class="text-primary" />
      <h2 class="text-xl font-medium">{$t('review_empty_title')}</h2>
      <p class="max-w-md text-gray-500 dark:text-gray-400">{$t('review_empty_description')}</p>
      <Button leadingIcon={mdiPlus} loading={isUploading} disabled={isUploading} onclick={handleAddImages}>
        {$t('review_add_images')}
      </Button>
    </div>
  {:else}
    <div class="flex h-full w-full overflow-hidden">
      <div class="flex min-w-0 flex-1 flex-col gap-3 p-3">
        <!-- Every pending image, decided ones included, so any of them can be revisited. -->
        <div bind:this={stripElement} class="flex shrink-0 gap-2 overflow-x-auto pb-2 immich-scrollbar">
          {#each items as item, i (item.assetId)}
            <ReviewThumbnail
              assetId={item.assetId}
              decision={item.decision}
              selected={i === index}
              {i}
              onclick={() => (index = i)}
            />
          {/each}
        </div>

        <div class="flex shrink-0 items-center justify-between text-sm text-gray-600 dark:text-gray-300">
          <span class="truncate" title={currentAsset?.originalFileName}>{currentAsset?.originalFileName ?? ''}</span>
          <span class="shrink-0 rounded-full bg-gray-100 px-3 py-1 dark:bg-immich-dark-gray">
            {$t('review_count', { values: { current: index + 1, total: items.length } })}
          </span>
        </div>

        {#if currentSimilar.length > 0}
          <div
            class="flex shrink-0 items-center gap-3 rounded-2xl border border-amber-400 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-100"
          >
            <span class="font-medium">{$t('review_looks_like_library')}</span>
            <div class="flex gap-2 overflow-x-auto">
              {#each currentSimilar as match (match.assetId)}
                <a
                  href="{AppRoute.PHOTOS}/{match.assetId}"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="shrink-0 overflow-hidden rounded-lg ring-1 ring-amber-400 hover:ring-2"
                >
                  <img
                    src={getAssetThumbnailUrl({ id: match.assetId })}
                    alt=""
                    class="size-12 object-cover"
                    draggable="false"
                  />
                </a>
              {/each}
            </div>
          </div>
        {/if}

        <div
          bind:this={stageElement}
          class="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-2xl bg-gray-100 dark:bg-immich-dark-gray"
        >
          {#if current}
            {#key current.assetId}
              <ReviewPreview
                assetId={current.assetId}
                alt={currentAsset?.originalFileName ?? ''}
                bind:element={previewElement}
              />
            {/key}
            {#if current.decision !== ReviewDecision.Undecided}
              <div
                class="absolute start-3 top-3 flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium text-white {current.decision ===
                ReviewDecision.Keep
                  ? 'bg-green-700'
                  : 'bg-red-600'}"
              >
                <Icon icon={current.decision === ReviewDecision.Keep ? mdiCheck : mdiTrashCanOutline} size="18" />
                {current.decision === ReviewDecision.Keep ? $t('keep') : $t('delete')}
              </div>
            {/if}
          {/if}
          <div class="absolute end-3 top-3">
            <IconButton
              icon={mdiFullscreen}
              aria-label={$t('review_fullscreen')}
              shape="round"
              color="secondary"
              variant="filled"
              onclick={toggleFullscreen}
            />
          </div>
        </div>

        <div class="flex shrink-0 flex-wrap items-center gap-2 text-sm">
          <Button size="small" variant="ghost" color="secondary" leadingIcon={mdiPlus} onclick={handleAddToAlbum}>
            {$t('add_to_album')}
          </Button>
          {#if stagedAlbums.length > 0}
            <span class="text-gray-500 dark:text-gray-400">{$t('review_staged_albums')}:</span>
            {#each stagedAlbums as album (album.id)}
              <span class="flex items-center gap-1 rounded-full bg-gray-100 py-1 ps-3 pe-1 dark:bg-immich-dark-gray">
                {album.albumName}
                <IconButton
                  icon={mdiClose}
                  aria-label={$t('remove')}
                  size="tiny"
                  shape="round"
                  color="secondary"
                  variant="ghost"
                  onclick={() => handleRemoveAlbum(album.id)}
                />
              </span>
            {/each}
          {/if}
        </div>

        <div class="flex shrink-0 items-end justify-center gap-6 sm:gap-10">
          <button
            type="button"
            class="flex size-18 items-center justify-center rounded-full bg-red-600 text-white shadow-lg transition hover:scale-105 hover:bg-red-700"
            title="{$t('delete')} (D)"
            aria-label={$t('delete')}
            onclick={() => decide(ReviewDecision.Delete)}
          >
            <Icon icon={mdiTrashCanOutline} size="34" />
          </button>
          <button
            type="button"
            class="flex flex-col items-center gap-1 text-sm disabled:opacity-40 dark:text-white"
            title="{$t('undo')} (Ctrl+Z)"
            disabled={history.length === 0}
            onclick={undo}
          >
            <span
              class="flex size-14 items-center justify-center rounded-full bg-gray-200 transition hover:bg-gray-300 dark:bg-immich-dark-gray dark:hover:bg-gray-700"
            >
              <Icon icon={mdiUndo} size="26" />
            </span>
            {$t('undo')}
          </button>
          <button
            type="button"
            class="flex flex-col items-center gap-1 text-sm dark:text-white"
            title="{$t('skip')} (S)"
            onclick={skip}
          >
            <span
              class="flex size-14 items-center justify-center rounded-full bg-gray-200 transition hover:bg-gray-300 dark:bg-immich-dark-gray dark:hover:bg-gray-700"
            >
              <Icon icon={mdiSkipNext} size="26" />
            </span>
            {$t('skip')}
          </button>
          <button
            type="button"
            class="flex size-18 items-center justify-center rounded-full bg-green-700 text-white shadow-lg transition hover:scale-105 hover:bg-green-800"
            title="{$t('keep')} (K)"
            aria-label={$t('keep')}
            onclick={() => decide(ReviewDecision.Keep)}
          >
            <Icon icon={mdiCheck} size="34" />
          </button>
        </div>

        <div class="flex shrink-0 items-center justify-between border-t pt-3 dark:border-gray-700">
          <span class="text-sm text-gray-500 dark:text-gray-400">
            {undecidedCount > 0
              ? $t('review_remaining', { values: { count: undecidedCount } })
              : $t('review_all_decided')}
          </span>
          <Button
            trailingIcon={mdiArrowRight}
            variant="ghost"
            disabled={undecidedCount > 0 || isFinishing}
            loading={isFinishing}
            onclick={handleFinish}
          >
            {$t('review_finish')}
          </Button>
        </div>
      </div>

      <aside class="hidden w-90 shrink-0 overflow-y-auto border-s immich-scrollbar dark:border-gray-700 lg:block">
        {#if shownAsset}
          {#key shownAsset.id}
            <DetailPanel asset={shownAsset} albums={stagedAlbums} onClose={() => {}} />
          {/key}
        {:else}
          <div class="flex h-full items-center justify-center"><LoadingSpinner /></div>
        {/if}
      </aside>
    </div>
  {/if}
</UserPageLayout>
