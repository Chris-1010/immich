<script lang="ts">
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { assetViewingStore } from '$lib/stores/asset-viewing.store';
  import { isFaceEditMode } from '$lib/stores/face-edit.svelte';
  import { mobileDevice } from '$lib/stores/mobile-device.svelte';
  import { photoZoomState } from '$lib/stores/zoom-image.store';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { createFace, getAllPeople, type PersonResponseDto } from '@immich/sdk';
  import { Button, Input, toastManager } from '@immich/ui';
  import { Canvas, InteractiveFabricObject, Rect, type TPointerEventInfo } from 'fabric';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';

  const minZoom = 1;
  const maxZoom = 10;

  interface Props {
    htmlElement: HTMLImageElement | HTMLVideoElement;
    containerWidth: number;
    containerHeight: number;
    assetId: string;
  }

  let { htmlElement, containerWidth, containerHeight, assetId }: Props = $props();

  // Videos are tagged without drawing a box: the detected preview frame is too low-res to place a
  // box meaningfully, so the person selector opens immediately and the whole frame is tagged.
  const isVideo = htmlElement instanceof HTMLVideoElement;

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let canvas: Canvas | undefined = $state();
  let faceRect: Rect | undefined = $state();
  let faceSelectorEl: HTMLDivElement | undefined = $state();
  let searchInputEl: HTMLInputElement | null = $state(null);
  // The box is drawn by the user (click-drag) rather than pre-placed; the person selector only
  // appears once a box exists.
  let boxDrawn = $state(false);
  let isDrawing = false;
  let drawOrigin = { x: 0, y: 0 };
  let page = $state(1);
  let candidates = $state<PersonResponseDto[]>([]);

  let searchTerm = $state('');
  // Keyboard-driven highlight in the person list (non-phone only); Enter tags the highlighted person.
  let highlightedIndex = $state(0);
  let listEl: HTMLDivElement | undefined = $state();

  let filteredCandidates = $derived(
    searchTerm
      ? candidates.filter((person) => person.name.toLowerCase().includes(searchTerm.toLowerCase()))
      : candidates,
  );

  $effect(() => {
    // Reset the highlight to the top whenever the filtered list changes so it stays in range.
    void filteredCandidates;
    highlightedIndex = 0;
  });

  const configureControlStyle = () => {
    InteractiveFabricObject.ownDefaults = {
      ...InteractiveFabricObject.ownDefaults,
      cornerStyle: 'circle',
      cornerColor: 'rgb(153,166,251)',
      cornerSize: 10,
      padding: 8,
      transparentCorners: false,
      lockRotation: true,
      hasBorders: true,
    };
  };

  const setupCanvas = () => {
    if (!canvasEl || !htmlElement) {
      return;
    }

    canvas = new Canvas(canvasEl);
    // Disable the rubber-band group selection so a drag on empty canvas draws the tag box instead.
    canvas.selection = false;
    configureControlStyle();

    // Let the user keep zooming while the tag box is open. Scrolling over the canvas drives the
    // shared photo zoom state; the underlying image and this canvas stay aligned through it.
    canvas.on('mouse:wheel', (opt: TPointerEventInfo<WheelEvent>) => {
      opt.e.preventDefault();
      opt.e.stopPropagation();

      const state = get(photoZoomState);
      if (!state) {
        return;
      }

      const factor = opt.e.deltaY < 0 ? 1.1 : 0.9;
      const currentZoom = Math.min(Math.max(state.currentZoom * factor, minZoom), maxZoom);
      if (currentZoom === state.currentZoom) {
        return;
      }

      photoZoomState.set({ ...state, currentZoom });
    });

    canvas.on('mouse:down', onDrawStart);
    canvas.on('mouse:move', onDrawMove);
    canvas.on('mouse:up', onDrawEnd);
  };

  const createFaceRect = (left: number, top: number): Rect =>
    // eslint-disable-next-line tscompat/tscompat
    new Rect({
      left,
      top,
      width: 0,
      height: 0,
      fill: 'rgba(66,80,175,0.25)',
      stroke: 'rgb(66,80,175)',
      strokeWidth: 2,
      strokeUniform: true,
      objectCaching: true,
      rx: 8,
      ry: 8,
    });

  // Draw the box by dragging: the first pointer-down fixes one corner, dragging sizes it to the
  // opposite corner. Once released the box behaves like a normal move/resize target.
  const onDrawStart = (opt: TPointerEventInfo) => {
    if (!canvas || boxDrawn) {
      return;
    }

    const point = canvas.getScenePoint(opt.e);
    drawOrigin = { x: point.x, y: point.y };
    isDrawing = true;

    faceRect = createFaceRect(point.x, point.y);
    canvas.add(faceRect);
    canvas.setActiveObject(faceRect);
  };

  const onDrawMove = (opt: TPointerEventInfo) => {
    if (!canvas || !isDrawing || !faceRect) {
      return;
    }

    const point = canvas.getScenePoint(opt.e);
    faceRect.set({
      left: Math.min(drawOrigin.x, point.x),
      top: Math.min(drawOrigin.y, point.y),
      width: Math.abs(point.x - drawOrigin.x),
      height: Math.abs(point.y - drawOrigin.y),
    });
    faceRect.setCoords();
    canvas.requestRenderAll();
    positionFaceSelector();
  };

  const onDrawEnd = () => {
    if (!canvas || !isDrawing || !faceRect) {
      return;
    }

    isDrawing = false;

    // Ignore an accidental click/tiny drag so the box isn't a stray dot. Measure in screen pixels
    // (scene size * zoom) so the threshold holds regardless of how far the image is zoomed in.
    const currentZoom = get(photoZoomState)?.currentZoom ?? 1;
    if (faceRect.width * currentZoom < 8 || faceRect.height * currentZoom < 8) {
      canvas.remove(faceRect);
      faceRect = undefined;
      return;
    }

    canvas.setActiveObject(faceRect);
    faceRect.setCoords();
    boxDrawn = true;
    positionFaceSelector();
  };

  // The photo zoom transforms the image as `screen = zoom * point + position` (origin 0,0). Mirror
  // that onto the fabric viewport so the tag box tracks the image at any zoom/pan, while the box's
  // own scene coordinates stay in the un-zoomed space the crop math expects.
  const syncViewport = () => {
    const zoom = get(photoZoomState);
    if (!canvas || !zoom) {
      return;
    }

    canvas.setViewportTransform([
      zoom.currentZoom,
      0,
      0,
      zoom.currentZoom,
      zoom.currentPositionX,
      zoom.currentPositionY,
    ]);
    positionFaceSelector();
  };

  $effect(() => {
    // React to any zoom/pan change so the overlay stays glued to the image.
    void $photoZoomState;
    syncViewport();
  });

  $effect(() => {
    // Once the selector is un-hidden it has real dimensions, so place it next to the box.
    if (boxDrawn) {
      positionFaceSelector();
      focusSearch();
    }
  });

  onMount(async () => {
    if (isVideo) {
      // No canvas drawing for videos; jump straight to the person selector.
      boxDrawn = true;
    } else {
      setupCanvas();
    }
    await getPeople();
  });

  $effect(() => {
    if (!canvas) {
      return;
    }

    canvas.setDimensions({
      width: containerWidth,
      height: containerHeight,
    });

    syncViewport();
  });

  const getContainedSize = (
    img: HTMLImageElement | HTMLVideoElement,
  ): { actualWidth: number; actualHeight: number } => {
    if (img instanceof HTMLImageElement) {
      const ratio = img.naturalWidth / img.naturalHeight;
      let actualWidth = img.height * ratio;
      let actualHeight = img.height;
      if (actualWidth > img.width) {
        actualWidth = img.width;
        actualHeight = img.width / ratio;
      }
      return { actualWidth, actualHeight };
    } else if (img instanceof HTMLVideoElement) {
      const ratio = img.videoWidth / img.videoHeight;
      let actualWidth = img.clientHeight * ratio;
      let actualHeight = img.clientHeight;
      if (actualWidth > img.clientWidth) {
        actualWidth = img.clientWidth;
        actualHeight = img.clientWidth / ratio;
      }
      return { actualWidth, actualHeight };
    }

    return { actualWidth: 0, actualHeight: 0 };
  };

  const cancel = () => {
    isFaceEditMode.value = false;
  };

  const getPeople = async () => {
    const { hasNextPage, people, total } = await getAllPeople({ page, size: 1000, withHidden: false });

    if (candidates.length === total) {
      return;
    }

    candidates = [...candidates, ...people];

    if (hasNextPage) {
      page++;
    }
  };

  // The photo container sits in a negative z-index stacking context, so a fixed selector inside it
  // would still paint behind the mobile detail sheet. Move it to the body to escape that.
  const portalOnMobile = (node: HTMLElement) => {
    if (!mobileDevice.maxMd) {
      return;
    }

    document.body.append(node);

    return {
      destroy: () => node.remove(),
    };
  };

  const positionFaceSelector = () => {
    if (mobileDevice.maxMd) {
      return;
    }

    if (!faceSelectorEl) {
      return;
    }

    // No box (videos): center the selector in the viewer since there's nothing to anchor it to.
    if (!faceRect) {
      faceSelectorEl.style.left = `${Math.max((containerWidth - faceSelectorEl.offsetWidth) / 2, 15)}px`;
      faceSelectorEl.style.top = `${Math.max((containerHeight - faceSelectorEl.offsetHeight) / 2, 15)}px`;
      return;
    }

    // getBoundingRect() is in scene coordinates; project it to on-screen coordinates so the selector
    // sits next to the box the user actually sees at the current zoom/pan.
    const zoom = get(photoZoomState);
    const bounding = faceRect.getBoundingRect();
    const rect = zoom
      ? {
          left: bounding.left * zoom.currentZoom + zoom.currentPositionX,
          top: bounding.top * zoom.currentZoom + zoom.currentPositionY,
          width: bounding.width * zoom.currentZoom,
          height: bounding.height * zoom.currentZoom,
        }
      : bounding;
    const selectorWidth = faceSelectorEl.offsetWidth;
    const selectorHeight = faceSelectorEl.offsetHeight;

    const spaceAbove = rect.top;
    const spaceBelow = containerHeight - (rect.top + rect.height);
    const spaceLeft = rect.left;
    const spaceRight = containerWidth - (rect.left + rect.width);

    let top, left;

    if (
      spaceBelow >= selectorHeight ||
      (spaceBelow >= spaceAbove && spaceBelow >= spaceLeft && spaceBelow >= spaceRight)
    ) {
      top = rect.top + rect.height + 15;
      left = rect.left;
    } else if (
      spaceAbove >= selectorHeight ||
      (spaceAbove >= spaceBelow && spaceAbove >= spaceLeft && spaceAbove >= spaceRight)
    ) {
      top = rect.top - selectorHeight - 15;
      left = rect.left;
    } else if (
      spaceRight >= selectorWidth ||
      (spaceRight >= spaceLeft && spaceRight >= spaceAbove && spaceRight >= spaceBelow)
    ) {
      top = rect.top;
      left = rect.left + rect.width + 15;
    } else {
      top = rect.top;
      left = rect.left - selectorWidth - 15;
    }

    if (left + selectorWidth > containerWidth) {
      left = containerWidth - selectorWidth - 15;
    }

    if (left < 0) {
      left = 15;
    }

    if (top + selectorHeight > containerHeight) {
      top = containerHeight - selectorHeight - 15;
    }

    if (top < 0) {
      top = 15;
    }

    faceSelectorEl.style.top = `${top}px`;
    faceSelectorEl.style.left = `${left}px`;
  };

  // Focus the search on larger screens; on a phone this would pop up the keyboard over the image.
  const focusSearch = () => {
    if (!mobileDevice.maxMd) {
      searchInputEl?.focus();
    }
  };

  const scrollHighlightedIntoView = () => {
    listEl?.children[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
  };

  // On larger screens let the up/down arrows walk the person list and Enter tag the highlighted one.
  // Phones rely on tapping, so the keyboard navigation is skipped there.
  const onSelectorKeydown = (event: KeyboardEvent) => {
    if (mobileDevice.maxMd || !boxDrawn || filteredCandidates.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        highlightedIndex = (highlightedIndex + 1) % filteredCandidates.length;
        scrollHighlightedIntoView();
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        highlightedIndex = (highlightedIndex - 1 + filteredCandidates.length) % filteredCandidates.length;
        scrollHighlightedIntoView();
        break;
      }
      case 'Enter': {
        event.preventDefault();
        const person = filteredCandidates[highlightedIndex];
        if (person) {
          void tagFace(person);
        }
        break;
      }
    }
  };

  $effect(() => {
    if (faceRect) {
      faceRect.on('moving', positionFaceSelector);
      faceRect.on('scaling', positionFaceSelector);
      // Re-focus the search once a move/resize finishes so typing can continue right away.
      faceRect.on('modified', focusSearch);
    }
  });

  const getFaceCroppedCoordinates = () => {
    if (!htmlElement) {
      return;
    }

    // Videos are tagged without a drawn box, so record the whole frame as the face region.
    if (htmlElement instanceof HTMLVideoElement) {
      return {
        imageWidth: htmlElement.videoWidth,
        imageHeight: htmlElement.videoHeight,
        x: 0,
        y: 0,
        width: htmlElement.videoWidth,
        height: htmlElement.videoHeight,
      };
    }

    if (!faceRect) {
      return;
    }

    const { left, top, width, height } = faceRect.getBoundingRect();
    const { actualWidth, actualHeight } = getContainedSize(htmlElement);

    const offsetArea = {
      width: (containerWidth - actualWidth) / 2,
      height: (containerHeight - actualHeight) / 2,
    };

    const x1Coeff = (left - offsetArea.width) / actualWidth;
    const y1Coeff = (top - offsetArea.height) / actualHeight;
    const x2Coeff = (left + width - offsetArea.width) / actualWidth;
    const y2Coeff = (top + height - offsetArea.height) / actualHeight;

    // transpose to the natural image location
    if (htmlElement instanceof HTMLImageElement) {
      const x1 = x1Coeff * htmlElement.naturalWidth;
      const y1 = y1Coeff * htmlElement.naturalHeight;
      const x2 = x2Coeff * htmlElement.naturalWidth;
      const y2 = y2Coeff * htmlElement.naturalHeight;

      return {
        imageWidth: htmlElement.naturalWidth,
        imageHeight: htmlElement.naturalHeight,
        x: Math.floor(x1),
        y: Math.floor(y1),
        width: Math.floor(x2 - x1),
        height: Math.floor(y2 - y1),
      };
    }
  };

  const tagFace = async (person: PersonResponseDto) => {
    try {
      const data = getFaceCroppedCoordinates();
      if (!data) {
        toastManager.warning($t('error_tag_face_bounding_box'));
        return;
      }

      await createFace({
        assetFaceCreateDto: {
          assetId,
          personId: person.id,
          ...data,
        },
      });

      await assetViewingStore.setAssetId(assetId);
    } catch (error) {
      handleError(error, 'Error tagging face');
    } finally {
      isFaceEditMode.value = false;
    }
  };
</script>

<div class="absolute start-0 top-0">
  {#if !isVideo}
    <canvas bind:this={canvasEl} id="face-editor" class="absolute top-0 start-0"></canvas>
  {/if}

  {#if !boxDrawn}
    <div
      class="fixed top-20 start-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-white dark:bg-immich-dark-gray dark:text-immich-dark-fg backdrop-blur-sm ps-4 pe-2 py-2 rounded-full border border-gray-200 dark:border-gray-800 shadow-lg"
    >
      <p class="text-center text-sm">{$t('draw_box_around_face')}</p>
      <Button size="small" shape="round" onclick={cancel} color="danger">{$t('cancel')}</Button>
    </div>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
  <div
    id="face-selector"
    bind:this={faceSelectorEl}
    use:portalOnMobile
    onkeydown={onSelectorKeydown}
    role="listbox"
    tabindex="-1"
    class={[
      'bg-white dark:bg-immich-dark-gray dark:text-immich-dark-fg backdrop-blur-sm px-2 py-4 border border-gray-200 dark:border-gray-800',
      boxDrawn ? '' : 'hidden',
      mobileDevice.maxMd
        ? 'fixed bottom-0 start-0 end-0 z-30 w-full rounded-t-xl shadow-2xl'
        : 'absolute top-[calc(50%-250px)] start-[calc(50%-125px)] max-w-[250px] w-[250px] rounded-xl',
    ]}
  >
    <p class="text-center text-sm">{$t('select_person_to_tag')}</p>

    <div class="my-3 relative">
      <Input
        placeholder={$t('search_people')}
        bind:value={searchTerm}
        bind:ref={searchInputEl}
        size="tiny"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck={false}
      />
    </div>

    <div class={['overflow-y-auto mt-2', mobileDevice.maxMd ? 'max-h-[30svh]' : 'h-62.5']}>
      {#if filteredCandidates.length > 0}
        <div class="mt-2 rounded-lg" bind:this={listEl}>
          {#each filteredCandidates as person, index (person.id)}
            <button
              onclick={() => tagFace(person)}
              type="button"
              class={[
                'w-full flex place-items-center gap-2 rounded-lg ps-1 pe-4 py-2 hover:bg-immich-primary/25',
                !mobileDevice.maxMd && index === highlightedIndex && 'bg-immich-primary/25',
              ]}
            >
              <ImageThumbnail
                curve
                shadow
                url={getPeopleThumbnailUrl(person)}
                altText={person.name}
                title={person.name}
                widthStyle="30px"
                heightStyle="30px"
              />
              <p class="text-sm">
                {person.name}
              </p>
            </button>
          {/each}
        </div>
      {:else}
        <div class="flex items-center justify-center py-4">
          <p class="text-sm text-gray-500">{$t('no_people_found')}</p>
        </div>
      {/if}
    </div>

    <Button size="small" fullWidth onclick={cancel} color="danger" class="mt-2">{$t('cancel')}</Button>
  </div>
</div>
