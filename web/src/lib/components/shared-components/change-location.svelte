<script lang="ts">
  import { clickOutside } from '$lib/actions/click-outside';
  import { listNavigation } from '$lib/actions/list-navigation';
  import CoordinatesInput from '$lib/components/shared-components/coordinates-input.svelte';
  import type Map from '$lib/components/shared-components/map/map.svelte';
  import { timeDebounceOnSearch, timeToLoadTheMap } from '$lib/constants';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import { lastChosenLocation, savedLocations } from '$lib/stores/asset-editor.store';
  import { delay } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { searchPlaces, type AssetResponseDto, type PlacesResponseDto } from '@immich/sdk';
  import { ConfirmModal, IconButton, LoadingSpinner } from '@immich/ui';
  import { mdiMapMarkerMultipleOutline, mdiTrashCanOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { get } from 'svelte/store';

  interface Point {
    lng: number;
    lat: number;
  }

  interface Props {
    asset?: AssetResponseDto | undefined;
    point?: Point;
    onClose: (point?: Point) => void;
  }

  let { asset = undefined, point: initialPoint, onClose }: Props = $props();

  let places: PlacesResponseDto[] = $state([]);
  let suggestedPlaces: PlacesResponseDto[] = $derived(places.slice(0, 5));
  let searchWord: string = $state('');
  let latestSearchTimeout: number;
  let showLoadingSpinner = $state(false);
  let suggestionContainer: HTMLDivElement | undefined = $state();
  let hideSuggestion = $state(false);
  let mapElement = $state<ReturnType<typeof Map>>();

  let previousLocation = get(lastChosenLocation);

  let assetLat = $derived(initialPoint?.lat ?? asset?.exifInfo?.latitude ?? undefined);
  let assetLng = $derived(initialPoint?.lng ?? asset?.exifInfo?.longitude ?? undefined);

  let mapLat = $derived(assetLat ?? previousLocation?.lat ?? undefined);
  let mapLng = $derived(assetLng ?? previousLocation?.lng ?? undefined);

  let zoom = $derived(mapLat && mapLng ? 12.5 : 1);

  $effect(() => {
    if (mapElement && initialPoint) {
      mapElement.addClipMapMarker(initialPoint.lng, initialPoint.lat);
    }
  });

  $effect(() => {
    if (searchWord === '') {
      suggestedPlaces = [];
    }
  });

  let point: Point | null = $state(initialPoint ?? null);
  let selectedPlace: PlacesResponseDto | undefined = $state();
  let showSaveInput = $state(false);
  let saveNameInput = $state('');
  let savedFilter = $state('');

  const handleConfirm = (confirmed?: boolean) => {
    if (point && confirmed) {
      lastChosenLocation.set(point);
      onClose(point);
    } else {
      onClose();
    }
  };

  const getLocation = (name: string, admin1Name?: string, admin2Name?: string): string => {
    return `${name}${admin1Name ? ', ' + admin1Name : ''}${admin2Name ? ', ' + admin2Name : ''}`;
  };

  const handleSearchPlaces = () => {
    if (latestSearchTimeout) {
      clearTimeout(latestSearchTimeout);
    }
    showLoadingSpinner = true;

    // eslint-disable-next-line unicorn/prefer-global-this
    const searchTimeout = window.setTimeout(() => {
      if (searchWord === '') {
        places = [];
        showLoadingSpinner = false;
        return;
      }

      searchPlaces({ name: searchWord })
        .then((searchResult) => {
          if (latestSearchTimeout === searchTimeout) {
            places = searchResult;
            showLoadingSpinner = false;
          }
        })
        .catch((error) => {
          if (latestSearchTimeout === searchTimeout) {
            places = [];
            handleError(error, $t('errors.cant_search_places'));
            showLoadingSpinner = false;
          }
        });
    }, timeDebounceOnSearch);
    latestSearchTimeout = searchTimeout;
  };

  const handleUseSuggested = (latitude: number, longitude: number, place?: PlacesResponseDto) => {
    hideSuggestion = true;
    selectedPlace = place;
    showSaveInput = false;
    saveNameInput = '';
    point = { lng: longitude, lat: latitude };
    mapElement?.addClipMapMarker(longitude, latitude);
  };

  const handleOpenSaveInput = () => {
    saveNameInput = selectedPlace ? getLocation(selectedPlace.name, selectedPlace.admin1name, selectedPlace.admin2name) : '';
    showSaveInput = true;
  };

  const handleSaveLocation = () => {
    const name = saveNameInput.trim();
    if (!name || !point) return;
    savedLocations.add({ name, latitude: point.lat, longitude: point.lng });
    showSaveInput = false;
    saveNameInput = '';
  };

  const onUpdate = (lat: number, lng: number) => {
    point = { lat, lng };
    selectedPlace = undefined;
    showSaveInput = false;
    saveNameInput = '';
    mapElement?.addClipMapMarker(lng, lat);
  };
</script>

<ConfirmModal
  confirmColor="primary"
  title={$t('change_location')}
  icon={mdiMapMarkerMultipleOutline}
  size="large"
  onClose={handleConfirm}
>
  {#snippet promptSnippet()}
    <div class="flex w-full gap-4">
      <!-- Left: picker -->
      <div class="flex min-w-0 flex-1 flex-col gap-2">
        <div class="relative w-full z-1">
          {#if suggestionContainer}
            <div use:listNavigation={suggestionContainer}>
              <button type="button" class="w-full" onclick={() => (hideSuggestion = false)}>
                <SearchBar
                  placeholder={$t('search_places')}
                  bind:name={searchWord}
                  {showLoadingSpinner}
                  onReset={() => (suggestedPlaces = [])}
                  onSearch={handleSearchPlaces}
                  roundedBottom={suggestedPlaces.length === 0 || hideSuggestion}
                />
              </button>
            </div>
          {/if}

          <div
            class="absolute w-full"
            id="suggestion"
            bind:this={suggestionContainer}
            use:clickOutside={{ onOutclick: () => (hideSuggestion = true) }}
          >
            {#if !hideSuggestion}
              {#each suggestedPlaces as place, index (place.latitude + place.longitude)}
                <button
                  type="button"
                  class="flex w-full border-t border-gray-400 dark:border-immich-dark-gray h-14 place-items-center bg-gray-200 p-2 dark:bg-gray-700 hover:bg-gray-300 hover:dark:bg-[#232932] focus:bg-gray-300 focus:dark:bg-[#232932] {index ===
                  suggestedPlaces.length - 1
                    ? 'rounded-b-lg border-b'
                    : ''}"
                  onclick={() => handleUseSuggested(place.latitude, place.longitude, place)}
                >
                  <p class="ms-4 text-sm text-gray-700 dark:text-gray-100 truncate">
                    {getLocation(place.name, place.admin1name, place.admin2name)}
                  </p>
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <span>{$t('pick_a_location')}</span>
        <div class="h-125 min-h-75 w-full z-0">
          {#await import('$lib/components/shared-components/map/map.svelte')}
            {#await delay(timeToLoadTheMap) then}
              <div class="flex items-center justify-center h-full w-full">
                <LoadingSpinner />
              </div>
            {/await}
          {:then { default: Map }}
            <Map
              bind:this={mapElement}
              mapMarkers={assetLat !== undefined && assetLng !== undefined && asset
                ? [
                    {
                      id: asset.id,
                      lat: assetLat,
                      lon: assetLng,
                      city: asset.exifInfo?.city ?? null,
                      state: asset.exifInfo?.state ?? null,
                      country: asset.exifInfo?.country ?? null,
                    },
                  ]
                : []}
              {zoom}
              center={mapLat && mapLng ? { lat: mapLat, lng: mapLng } : undefined}
              simplified={true}
              clickable={true}
              onClickPoint={(selected) => (point = selected)}
              showSettings={false}
              rounded
            />
          {/await}
        </div>

        <div class="grid sm:grid-cols-2 gap-4 text-sm text-start mt-4">
          <CoordinatesInput lat={point ? point.lat : assetLat} lng={point ? point.lng : assetLng} {onUpdate} />
        </div>
      </div>

      <!-- Right: saved locations sidebar -->
      <div class="flex w-56 shrink-0 flex-col gap-2 border-l border-gray-200 pl-4 dark:border-gray-700">
        <p class="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          {$t('saved_locations')}
        </p>

        {#if $savedLocations.length > 0}
          <input
            type="text"
            bind:value={savedFilter}
            placeholder={$t('filter_places')}
            class="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-1.5 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
          />
        {/if}

        <div class="flex flex-1 flex-col gap-1 overflow-y-auto">
          {#if $savedLocations.length === 0}
            <p class="text-sm text-gray-400 dark:text-gray-500">{$t('no_saved_locations')}</p>
          {:else}
            {#each $savedLocations.map((loc, i) => ({ loc, i })).filter(({ loc }) => loc.name.toLowerCase().includes(savedFilter.toLowerCase())) as { loc, i } (loc.latitude + loc.longitude + loc.name)}
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="flex-1 truncate rounded-lg bg-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 hover:dark:bg-gray-700"
                  onclick={() => handleUseSuggested(loc.latitude, loc.longitude)}
                >
                  {loc.name}
                </button>
                <IconButton
                  icon={mdiTrashCanOutline}
                  size="small"
                  color="secondary"
                  aria-label={$t('delete')}
                  onclick={() => savedLocations.remove(i)}
                />
              </div>
            {/each}
          {/if}
        </div>

        {#if point}
          <div class="flex flex-col gap-2 border-t border-gray-200 pt-2 dark:border-gray-700">
            {#if showSaveInput}
              <input
                type="text"
                bind:value={saveNameInput}
                placeholder={$t('place_name')}
                class="w-full rounded-lg border border-gray-300 bg-gray-100 px-3 py-2 text-sm text-gray-700 dark:border-gray-600 dark:bg-gray-800 dark:text-white"
              />
              <div class="flex gap-2">
                <button
                  type="button"
                  class="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 hover:dark:bg-gray-700"
                  onclick={() => (showSaveInput = false)}
                >
                  {$t('cancel')}
                </button>
                <button
                  type="button"
                  class="flex-1 rounded-lg bg-immich-primary px-3 py-1.5 text-sm text-white disabled:opacity-50"
                  disabled={!saveNameInput.trim()}
                  onclick={handleSaveLocation}
                >
                  {$t('save')}
                </button>
              </div>
            {:else}
              <button
                type="button"
                class="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 hover:dark:bg-gray-700"
                onclick={handleOpenSaveInput}
              >
                + {$t('save_location')}
              </button>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  {/snippet}
</ConfirmModal>
