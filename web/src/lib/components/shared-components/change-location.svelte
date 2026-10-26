<script lang="ts" module>
  export interface Point {
    lng: number;
    lat: number;
  }

  // The modal resolves to one of three outcomes: applying real coordinates, toggling the No Location
  // marker (value: true to mark, false to unassign), or being dismissed (undefined). `name` is the
  // saved location or search result the point came from, and is absent once the point was moved by
  // hand (map click or typed coordinates), since the name no longer describes it.
  export type ChangeLocationResult =
    | { type: 'coordinates'; point: Point; name?: string }
    | { type: 'noLocation'; value: boolean };
</script>

<script lang="ts">
  import { clickOutside } from '$lib/actions/click-outside';
  import { listNavigation } from '$lib/actions/list-navigation';
  import CoordinatesInput from '$lib/components/shared-components/coordinates-input.svelte';
  import type Map from '$lib/components/shared-components/map/map.svelte';
  import { timeDebounceOnSearch, timeToLoadTheMap } from '$lib/constants';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { lastChosenLocation, savedLocations } from '$lib/stores/asset-editor.store';
  import { locale } from '$lib/stores/preferences.store';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { delay } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { formatDetailDate } from '$lib/utils/person-detail-dates';
  import { genderRingClass, loadPersonGenders } from '$lib/utils/person-gender';
  import {
    LocationSearchResultType,
    PersonDetailKind,
    searchLocations,
    type AssetResponseDto,
    type LocationSearchResultDto,
    type PersonPlaceResponseDto,
    type PlacesResponseDto,
    type RelationshipGender,
  } from '@immich/sdk';
  import { Button, HStack, Icon, IconButton, LoadingSpinner, Modal, ModalBody, ModalFooter } from '@immich/ui';
  import { mdiBookmarkOutline, mdiMapMarkerMultipleOutline, mdiMapMarkerOffOutline, mdiTrashCanOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import { onMount } from 'svelte';
  import { get } from 'svelte/store';

  interface Props {
    asset?: AssetResponseDto | undefined;
    point?: Point;
    /**
     * Pick a point that is not an asset's location, such as a person's Home pin. Hides the asset-only
     * No Location / Unassign action and leaves "last chosen location" alone, so pinning a home does
     * not move where the next asset edit opens. Pass the existing pin as `point` to open on it.
     */
    pointOnly?: boolean;
    onClose: (result?: ChangeLocationResult) => void;
  }

  let { asset = undefined, point: initialPoint, pointOnly = false, onClose }: Props = $props();

  // One list for saved locations, people's places and GeoNames places, in the order the server ranks
  // them. Before anything is typed it offers the saved locations and people's current places, so the
  // list is worth opening on its own; the saved part comes from the store, which stays current when
  // a location is saved or deleted here, and the people's places from the empty-query search.
  let searchWord: string = $state('');
  let results: LocationSearchResultDto[] = $state([]);
  let currentPeoplesPlaces: LocationSearchResultDto[] = $state([]);
  let suggestions: LocationSearchResultDto[] = $derived(
    searchWord === ''
      ? [...$savedLocations.map((saved) => ({ type: LocationSearchResultType.Saved, saved })), ...currentPeoplesPlaces]
      : results,
  );
  let latestSearchTimeout: number;
  let showLoadingSpinner = $state(false);
  let suggestionContainer: HTMLDivElement | undefined = $state();
  // Hidden until the search bar is clicked, so the before-typing list does not cover the map on open.
  let hideSuggestion = $state(true);
  let genders: Record<string, RelationshipGender> = $state({});
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

  let point: Point | null = $state(initialPoint ?? null);
  let selectedPlace: PlacesResponseDto | undefined = $state();
  let showSaveInput = $state(false);
  let saveNameInput = $state('');
  let savedFilter = $state('');
  let pickedName: string | undefined = $state();

  // A single asset already marked No Location offers "Unassign Location"; otherwise (including bulk
  // mode, where no single asset is passed) the action marks the selection No Location.
  let isAssetNoLocation = $derived(asset?.exifInfo?.noLocation === true);

  const handleApplyCoordinates = () => {
    if (!point) {
      return;
    }
    if (!pointOnly) {
      lastChosenLocation.set(point);
    }
    onClose({ type: 'coordinates', point, name: pickedName });
  };

  const handleNoLocation = () => {
    onClose({ type: 'noLocation', value: !isAssetNoLocation });
  };

  const getLocation = (name: string, admin1Name?: string, admin2Name?: string): string => {
    return `${name}${admin1Name ? ', ' + admin1Name : ''}${admin2Name ? ', ' + admin2Name : ''}`;
  };

  const personName = (person: PersonPlaceResponseDto) => person.personName || $t('person');

  /**
   * "Ethan's Home" for a current place, and "Ethan's former home · 2015 – 2021" (or "· until 2021"
   * when the start was never recorded) for a past one, which says when instead of where: the value
   * is what the current row adds, and a past one is told apart by its dates.
   */
  const personPlaceLabel = (person: PersonPlaceResponseDto) => {
    const name = personName(person);
    const isWork = person.kind === PersonDetailKind.Work;

    if (person.isCurrent) {
      return `${$t(isWork ? 'person_place_work' : 'person_place_home', { values: { name } })} · ${person.value}`;
    }

    const former = $t(isWork ? 'person_place_former_work' : 'person_place_former_home', { values: { name } });
    const until = formatDetailDate(person.until ?? '', person.untilPrecision, $locale);
    const range = person.since
      ? $t('detail_range', {
          values: { since: formatDetailDate(person.since, person.sincePrecision, $locale), until },
        })
      : $t('person_place_until', { values: { date: until } });

    return `${former} · ${range}`;
  };

  const suggestionKey = (result: LocationSearchResultDto) =>
    result.saved?.id ??
    result.person?.detailId ??
    `${result.type}:${result.place?.latitude}:${result.place?.longitude}:${result.place?.name}`;

  /**
   * Picking a row sets the point and carries the name it should be known by, the same way for every
   * row type: the saved location's name, the person's place as typed (e.g. "Rathmines"), or the
   * place's "Name, Admin1, Admin2".
   */
  const handleUseSuggestion = (result: LocationSearchResultDto) => {
    if (result.saved) {
      handleUseSuggested(result.saved.latitude, result.saved.longitude, undefined, result.saved.name);
    } else if (result.person) {
      handleUseSuggested(result.person.latitude, result.person.longitude, undefined, result.person.value);
    } else if (result.place) {
      handleUseSuggested(result.place.latitude, result.place.longitude, result.place);
    }
  };

  const handleSearchPlaces = () => {
    // Typing reopens the list, including after keyboard focus that never clicked the bar.
    hideSuggestion = false;
    if (latestSearchTimeout) {
      clearTimeout(latestSearchTimeout);
    }
    showLoadingSpinner = true;

    // eslint-disable-next-line unicorn/prefer-global-this
    const searchTimeout = window.setTimeout(() => {
      if (searchWord === '') {
        results = [];
        showLoadingSpinner = false;
        return;
      }

      searchLocations({ query: searchWord })
        .then((searchResult) => {
          if (latestSearchTimeout === searchTimeout) {
            results = searchResult;
            showLoadingSpinner = false;
          }
        })
        .catch((error) => {
          if (latestSearchTimeout === searchTimeout) {
            results = [];
            handleError(error, $t('errors.cant_search_places'));
            showLoadingSpinner = false;
          }
        });
    }, timeDebounceOnSearch);
    latestSearchTimeout = searchTimeout;
  };

  const handleUseSuggested = (latitude: number, longitude: number, place?: PlacesResponseDto, name?: string) => {
    hideSuggestion = true;
    selectedPlace = place;
    pickedName = place ? getLocation(place.name, place.admin1name, place.admin2name) : name;
    showSaveInput = false;
    saveNameInput = '';
    point = { lng: longitude, lat: latitude };
    mapElement?.addClipMapMarker(longitude, latitude);
  };

  const handleOpenSaveInput = () => {
    saveNameInput = selectedPlace
      ? getLocation(selectedPlace.name, selectedPlace.admin1name, selectedPlace.admin2name)
      : '';
    showSaveInput = true;
  };

  const handleSaveLocation = async () => {
    const name = saveNameInput.trim();
    if (!name || !point) {
      return;
    }
    try {
      await savedLocations.add({ name, latitude: point.lat, longitude: point.lng });
      showSaveInput = false;
      saveNameInput = '';
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_location'));
    }
  };

  const handleRemoveSavedLocation = async (id: string) => {
    try {
      await savedLocations.remove(id);
    } catch (error) {
      handleError(error, $t('errors.unable_to_delete_saved_location'));
    }
  };

  // Fill the saved list from the server (moving anything left in browser storage there first). The
  // picker opens without waiting: the list appears when the answer arrives.
  //
  // The people's current places for the before-typing list, and the gender rings on their faces, load
  // alongside. Neither is worth an error: without them the list simply starts with less, and the
  // faces go unringed, which already means "unknown".
  onMount(() => {
    savedLocations.load().catch((error: unknown) => handleError(error, $t('errors.unable_to_load_saved_locations')));
    searchLocations({})
      .then(
        (defaults) => (currentPeoplesPlaces = defaults.filter(({ type }) => type === LocationSearchResultType.Person)),
      )
      .catch(() => {});
    loadPersonGenders()
      .then((loaded) => (genders = loaded))
      .catch(() => {});
  });

  const onUpdate = (lat: number, lng: number) => {
    point = { lat, lng };
    selectedPlace = undefined;
    pickedName = undefined;
    showSaveInput = false;
    saveNameInput = '';
    mapElement?.addClipMapMarker(lng, lat);
  };
</script>

<Modal title={$t('change_location')} icon={mdiMapMarkerMultipleOutline} size="large" onClose={() => onClose()}>
  <ModalBody>
    <div class="flex w-full flex-col gap-4 sm:flex-row">
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
                  onReset={() => (results = [])}
                  onSearch={handleSearchPlaces}
                  roundedBottom={suggestions.length === 0 || hideSuggestion}
                />
              </button>
            </div>
          {/if}

          <div
            class="absolute max-h-96 w-full overflow-y-auto rounded-b-lg"
            id="suggestion"
            bind:this={suggestionContainer}
            use:clickOutside={{ onOutclick: () => (hideSuggestion = true) }}
          >
            {#if !hideSuggestion}
              {#each suggestions as result, index (suggestionKey(result))}
                <button
                  type="button"
                  class="flex w-full border-t border-gray-400 dark:border-immich-dark-gray h-14 place-items-center gap-3 bg-gray-200 p-2 dark:bg-gray-700 hover:bg-gray-300 hover:dark:bg-[#232932] focus:bg-gray-300 focus:dark:bg-[#232932] {index ===
                  suggestions.length - 1
                    ? 'rounded-b-lg border-b'
                    : ''}"
                  onclick={() => handleUseSuggestion(result)}
                >
                  {#if result.saved}
                    <Icon icon={mdiBookmarkOutline} size="1.25em" class="ms-2 shrink-0 text-primary" aria-hidden />
                    <p class="text-sm text-gray-700 dark:text-gray-100 truncate">{result.saved.name}</p>
                  {:else if result.person}
                    {@const person = result.person}
                    <ImageThumbnail
                      circle
                      shadow
                      url={getPeopleThumbnailUrl({ id: person.personId, updatedAt: person.personUpdatedAt })}
                      altText={personName(person)}
                      widthStyle="2rem"
                      heightStyle="2rem"
                      class="ms-1 shrink-0 {genderRingClass(genders[person.personId])}"
                    />
                    <p class="text-sm text-gray-700 dark:text-gray-100 truncate" title={person.value}>
                      {personPlaceLabel(person)}
                    </p>
                  {:else if result.place}
                    <p class="ms-4 text-sm text-gray-700 dark:text-gray-100 truncate">
                      {getLocation(result.place.name, result.place.admin1name, result.place.admin2name)}
                    </p>
                  {/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>

        <span>{$t('pick_a_location')}</span>
        <div class="h-64 min-h-64 w-full z-0 sm:h-125 sm:min-h-75">
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
              onClickPoint={(selected) => {
                point = selected;
                pickedName = undefined;
              }}
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
      <div
        class="flex w-full shrink-0 flex-col gap-2 border-t border-gray-200 pt-4 sm:w-56 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 dark:border-gray-700"
      >
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

        <div class="flex flex-col gap-1 overflow-y-auto max-h-40 sm:max-h-none sm:flex-1">
          {#if $savedLocations.length === 0}
            <p class="text-sm text-gray-400 dark:text-gray-500">{$t('no_saved_locations')}</p>
          {:else}
            {#each $savedLocations.filter((loc) => loc.name
                .toLowerCase()
                .includes(savedFilter.toLowerCase())) as loc (loc.id)}
              <div class="flex items-center gap-1">
                <button
                  type="button"
                  class="flex-1 truncate rounded-lg bg-gray-100 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-100 hover:dark:bg-gray-700"
                  onclick={() => handleUseSuggested(loc.latitude, loc.longitude, undefined, loc.name)}
                >
                  {loc.name}
                </button>
                <IconButton
                  icon={mdiTrashCanOutline}
                  size="small"
                  color="secondary"
                  aria-label={$t('delete')}
                  onclick={() => handleRemoveSavedLocation(loc.id)}
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
  </ModalBody>

  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={() => onClose()}>
        {$t('cancel')}
      </Button>
      {#if !pointOnly}
        <Button
          shape="round"
          color="secondary"
          fullWidth
          leadingIcon={mdiMapMarkerOffOutline}
          onclick={handleNoLocation}
        >
          {isAssetNoLocation ? $t('unassign_location') : $t('no_location')}
        </Button>
      {/if}
      <Button shape="round" color="primary" fullWidth disabled={!point} onclick={handleApplyCoordinates}>
        {$t('confirm')}
      </Button>
    </HStack>
  </ModalFooter>
</Modal>
