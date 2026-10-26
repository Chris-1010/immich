<script lang="ts">
  import { afterNavigate, goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { clickOutside } from '$lib/actions/click-outside';
  import { listNavigation } from '$lib/actions/list-navigation';
  import { scrollMemoryClearer } from '$lib/actions/scroll-memory';
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import ChangeLocation from '$lib/components/shared-components/change-location.svelte';
  import EditNameInput from '$lib/components/faces-page/edit-name-input.svelte';
  import { setPersonPageContext } from '$lib/components/faces-page/person-page-context';
  import PersonContactChips from '$lib/components/faces-page/person-contact-chips.svelte';
  import PersonDetailsBox from '$lib/components/faces-page/person-details-box.svelte';
  import { AppRoute, PersonPageViewMode, QueryParameter, SessionStorageKey } from '$lib/constants';
  import ContactFieldModal from '$lib/modals/ContactFieldModal.svelte';
  import PersonDetailsModal from '$lib/modals/PersonDetailsModal.svelte';
  import PersonEditBirthDateModal from '$lib/modals/PersonEditBirthDateModal.svelte';
  import PersonMergeSuggestionModal from '$lib/modals/PersonMergeSuggestionModal.svelte';
  import { websocketEvents } from '$lib/stores/websocket';
  import { getPeopleThumbnailUrl, handlePromiseError } from '$lib/utils';
  import {
    asEndedPayload,
    resolvePinName,
    type ContactFieldPin,
    type ContactFieldRow,
  } from '$lib/utils/contact-fields';
  import { handleError } from '$lib/utils/handle-error';
  import { isExternalUrl } from '$lib/utils/navigation';
  import { genderRingClass, loadPersonGenders } from '$lib/utils/person-gender';
  import {
    getPersonStatistics,
    searchPerson,
    updatePerson,
    updatePersonDetails,
    type PersonDetailKind,
    type PersonDetailResponseDto,
    type PersonResponseDto,
    type RelationshipGender,
  } from '@immich/sdk';
  import { Icon, LoadingSpinner, modalManager, toastManager } from '@immich/ui';
  import { mdiAccountMultipleOutline, mdiImageMultipleOutline } from '@mdi/js';
  import { onMount, type Snippet } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { LayoutData } from './$types';

  interface Props {
    data: LayoutData;
    children?: Snippet;
  }

  let { data, children }: Props = $props();

  /** Route id of this layout, used to tell a tab switch apart from arriving from elsewhere. */
  const PERSON_ROUTE_ID = '/(user)/people/[personId]';

  let person = $derived(data.person);
  let numberOfAssets = $derived(data.statistics.assets);
  let thumbnailData = $derived(getPeopleThumbnailUrl(person));

  let viewMode: PersonPageViewMode = $state(PersonPageViewMode.VIEW_ASSETS);
  let previousRoute: string = $state(AppRoute.EXPLORE);

  let isEditingName = $state(false);
  let people: PersonResponseDto[] = [];
  let personMerge1: PersonResponseDto | undefined = $state();
  let personMerge2: PersonResponseDto | undefined = $state();
  let potentialMergePeople: PersonResponseDto[] = $state([]);
  let isSuggestionSelectedByUser = $state(false);

  let personName = '';
  let suggestedPeople: PersonResponseDto[] = $state([]);

  /**
   * Save the word used to search people name: for example,
   * if searching 'r' and the server returns 15 people with names starting with 'r',
   * there's no need to search again people with name starting with 'ri'.
   * However, it needs to make a new api request if searching 'r' returns 20 names (arbitrary value, the limit sent back by the server).
   * or if the new search word starts with another word / letter
   **/
  let isSearchingPeople = $state(false);
  let suggestionContainer: HTMLElement | undefined = $state();

  const photosHref = $derived(`${AppRoute.PEOPLE}/${person.id}`);
  const relationshipsHref = $derived(`${photosHref}/relationships`);
  const isRelationshipsTab = $derived($page.url.pathname.startsWith(relationshipsHref));

  const tabs = $derived([
    {
      title: $t('photos'),
      href: photosHref,
      icon: mdiImageMultipleOutline,
      isSelected: !isRelationshipsTab,
    },
    {
      title: $t('relationships'),
      href: relationshipsHref,
      icon: mdiAccountMultipleOutline,
      isSelected: isRelationshipsTab,
    },
  ]);

  const updateAssetCount = async () => {
    try {
      const { assets } = await getPersonStatistics({ id: person.id });
      numberOfAssets = assets;
    } catch (error) {
      handleError(error, "Can't update the asset count");
    }
  };

  setPersonPageContext({
    getPerson: () => person,
    setPerson: (updated: PersonResponseDto) => {
      person = updated;
    },
    getViewMode: () => viewMode,
    setViewMode: (updated: PersonPageViewMode) => {
      viewMode = updated;
    },
    getPreviousRoute: () => previousRoute,
    refreshAssetCount: updateAssetCount,
  });

  /**
   * What everyone's labels state they are, when anything does. The whole map is kept, not just this
   * person's, because the details box rings the faces in its along-with column the same way.
   */
  let genders = $state<Record<string, RelationshipGender>>({});
  let gender = $derived(genders[person.id]);

  /** Writable so a save in the modal updates the box in place, without waiting for a reload. */
  let details: PersonDetailResponseDto[] = $derived(data.details);

  const handleEditDetails = async () => {
    const saved = await modalManager.show(PersonDetailsModal, { personId: person.id, details });
    if (saved) {
      details = saved;
    }
  };

  /**
   * "Set pin" on a Home or Work row: the asset location picker in its point mode, opened on the
   * row's pin when it has one. Only coordinates come back from it, so a blank row is named here, and
   * the editor fills the value from that name only while the value is still blank.
   */
  const handleSetPin = async (row: ContactFieldRow): Promise<ContactFieldPin | undefined> => {
    const point =
      row.latitude !== null && row.longitude !== null ? { lat: row.latitude, lng: row.longitude } : undefined;
    const result = await modalManager.show(ChangeLocation, { pointOnly: true, point });
    if (result?.type !== 'coordinates') {
      return;
    }

    const { lat: latitude, lng: longitude } = result.point;
    // Typed text wins anyway, so a lookup it would only be thrown away for is skipped.
    const name = row.value.trim() ? undefined : await resolvePinName(latitude, longitude, result.name);
    return { latitude, longitude, name };
  };

  /** A chip's way into its editor. Each kind is edited on its own, apart from the free-text list. */
  const handleEditContactField = async (kind: PersonDetailKind) => {
    const saved = await modalManager.show(ContactFieldModal, {
      personId: person.id,
      kind,
      details,
      onSetPin: handleSetPin,
    });
    if (saved) {
      details = saved;
    }
  };

  /**
   * End from a chip's popover: the value stopped holding this month. The rest of the list goes back
   * exactly as it came, since the save replaces the whole of it.
   */
  const handleEndContactField = async (detail: PersonDetailResponseDto) => {
    try {
      details = await updatePersonDetails({
        id: person.id,
        personDetailsUpdateDto: { details: asEndedPayload(details, detail.id) },
      });
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_details'));
    }
  };

  /** The birthday chip opens the same modal the photos page menu has always used for it. */
  const handleEditBirthDate = async () => {
    const updated = await modalManager.show(PersonEditBirthDateModal, { person });
    if (updated) {
      person = updated;
    }
  };

  const loadGender = async () => {
    // A ring is decoration on a page that works without it, so a failure to load one is not worth
    // interrupting the page over.
    genders = await loadPersonGenders().catch(() => ({}) as Record<string, RelationshipGender>);
  };

  onMount(() => {
    handlePromiseError(loadGender());

    const routeBeforeThisPage = $page.url.searchParams.get(QueryParameter.PREVIOUS_ROUTE);
    if (routeBeforeThisPage && !isExternalUrl(routeBeforeThisPage)) {
      previousRoute = routeBeforeThisPage;
    }

    return websocketEvents.on('on_person_thumbnail', (personId: string) => {
      if (person.id === personId) {
        thumbnailData = getPeopleThumbnailUrl(person, Date.now().toString());
      }
    });
  });

  afterNavigate(({ from, to }) => {
    const cameFromThisPerson = from?.route.id?.startsWith(PERSON_ROUTE_ID) ?? false;

    // Re-read on the way back from the relationships tab, since a label added there is what
    // decides the ring.
    handlePromiseError(loadGender());

    // Switching tabs leaves any photo selection mode behind.
    if (cameFromThisPerson && from?.route.id !== to?.route.id) {
      viewMode = PersonPageViewMode.VIEW_ASSETS;
    }

    // Prevent setting previousRoute to this person's own tabs.
    if (from?.url && !cameFromThisPerson) {
      previousRoute = from.url.href;
    }
  });

  const handleMergeSuggestion = async (): Promise<{ merged: boolean }> => {
    if (!personMerge1 || !personMerge2) {
      return { merged: false };
    }

    const result = await modalManager.show(PersonMergeSuggestionModal, {
      personToMerge: personMerge1,
      personToBeMergedInto: personMerge2,
      potentialMergePeople,
    });

    if (!result) {
      return { merged: false };
    }

    const [personToMerge, personToBeMergedInto] = result;

    people = people.filter((person: PersonResponseDto) => person.id !== personToMerge.id);
    if (personToBeMergedInto.name != personName && person.id === personToBeMergedInto.id) {
      await updateAssetCount();
      return { merged: true };
    }
    await goto(`${AppRoute.PEOPLE}/${personToBeMergedInto.id}`, { replaceState: true });
    return { merged: true };
  };

  const handleSuggestPeople = async (person2: PersonResponseDto) => {
    isEditingName = false;
    if (person.id !== person2.id) {
      potentialMergePeople = [];
      personName = person.name;
      personMerge1 = person;
      personMerge2 = person2;
      isSuggestionSelectedByUser = true;

      await handleMergeSuggestion();
    }
  };

  const changeName = async () => {
    viewMode = PersonPageViewMode.VIEW_ASSETS;
    person.name = personName;
    isEditingName = false;

    if (isSuggestionSelectedByUser) {
      // User canceled the merge
      isSuggestionSelectedByUser = false;
      return;
    }

    try {
      person = await updatePerson({ id: person.id, personUpdateDto: { name: personName } });
      toastManager.success($t('change_name_successfully'));
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_name'));
    }
  };

  const handleCancelEditName = () => {
    isSearchingPeople = false;
    isEditingName = false;
  };

  const handleNameChange = async (name: string) => {
    isEditingName = false;
    potentialMergePeople = [];
    personName = name;

    if (person.name === personName) {
      return;
    }
    if (name === '') {
      await changeName();
      return;
    }

    const result = await searchPerson({ name: personName, withHidden: true });

    const existingPerson = result.find(
      ({ name, id }: PersonResponseDto) => name.toLowerCase() === personName.toLowerCase() && id !== person.id && name,
    );
    if (existingPerson) {
      personMerge2 = existingPerson;
      personMerge1 = person;
      potentialMergePeople = result
        .filter(
          (person: PersonResponseDto) =>
            personMerge2?.name.toLowerCase() === person.name.toLowerCase() &&
            person.id !== personMerge2.id &&
            person.id !== personMerge1?.id &&
            !person.isHidden,
        )
        .slice(0, 3);
      const { merged } = await handleMergeSuggestion();
      if (merged) {
        return;
      }
    }
    await changeName();
  };
</script>

<main
  class="relative z-0 flex h-dvh flex-col overflow-hidden px-2 md:px-6 md:pt-(--navbar-height-md) pt-(--navbar-height)"
  use:scrollMemoryClearer={{
    routeStartsWith: AppRoute.PEOPLE,
    beforeClear: () => {
      sessionStorage.removeItem(SessionStorageKey.INFINITE_SCROLL_PAGE);
    },
  }}
>
  {#if viewMode === PersonPageViewMode.VIEW_ASSETS}
    <!-- Person information block -->
    <!-- The details box is a sibling of the name block, not a child of it: the block cancels name
         editing on any click outside itself and on Escape, and nesting the box inside would hand
         those clicks and that Escape to the name editor instead of to the box and its popover. -->
    <div class="flex w-full shrink-0 flex-col sm:flex-row sm:place-items-stretch">
      <div
        class="relative w-fit shrink-0 p-4 sm:px-6 pt-12"
        use:clickOutside={{
          onOutclick: handleCancelEditName,
          onEscape: handleCancelEditName,
        }}
        use:listNavigation={suggestionContainer}
      >
        <section class="flex w-64 sm:w-96 place-items-center border-black">
          {#if isEditingName}
            <EditNameInput
              {person}
              bind:suggestedPeople
              name={person.name}
              bind:isSearchingPeople
              onChange={handleNameChange}
              {thumbnailData}
            />
          {:else}
            <div class="relative">
              <button
                type="button"
                class="flex items-center justify-center"
                title={$t('edit_name')}
                onclick={() => (isEditingName = true)}
              >
                <ImageThumbnail
                  circle
                  shadow
                  url={thumbnailData}
                  altText={person.name}
                  widthStyle="3.375rem"
                  heightStyle="3.375rem"
                  class={genderRingClass(gender)}
                />
                <div class="flex flex-col justify-center text-start px-4 text-primary">
                  <p class="w-40 sm:w-72 font-medium truncate">{person.name || $t('add_a_name')}</p>
                  <p class="text-sm text-gray-500 dark:text-gray-400">
                    {$t('assets_count', { values: { count: numberOfAssets } })}
                  </p>
                </div>
              </button>
            </div>
          {/if}
        </section>
        <!-- Under the name rather than inside its button: each chip is a button of its own, and a
             button cannot hold another. Indented to line up with the name past the thumbnail. -->
        {#if !isEditingName}
          <div class="ps-[4.375rem] pt-1 w-64 sm:w-96">
            <PersonContactChips
              {person}
              {details}
              {genders}
              onEdit={handleEditContactField}
              onEnd={handleEndContactField}
              onEditBirthDate={handleEditBirthDate}
            />
          </div>
        {/if}
        {#if isEditingName}
          <div class="absolute w-64 sm:w-96 z-1">
            {#if isSearchingPeople}
              <div
                class="flex border h-14 rounded-b-lg border-gray-400 dark:border-immich-dark-gray place-items-center bg-gray-200 p-2 dark:bg-gray-700"
              >
                <div class="flex w-full place-items-center">
                  <LoadingSpinner />
                </div>
              </div>
            {:else}
              <div bind:this={suggestionContainer}>
                {#each suggestedPeople as person, index (person.id)}
                  <button
                    type="button"
                    class="flex w-full border border-gray-200 dark:border-immich-dark-gray h-14 place-items-center bg-gray-100 p-2 dark:bg-gray-700 hover:bg-gray-300 hover:dark:bg-[#232932] focus:bg-gray-300 focus:dark:bg-[#232932] {index ===
                    suggestedPeople.length - 1
                      ? 'rounded-b-lg border-b'
                      : ''}"
                    onclick={() => handleSuggestPeople(person)}
                  >
                    <ImageThumbnail
                      circle
                      shadow
                      url={getPeopleThumbnailUrl(person)}
                      altText={person.name}
                      widthStyle="2rem"
                      heightStyle="2rem"
                    />
                    <p class="ms-4 text-gray-700 dark:text-gray-100">{person.name}</p>
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>

      <!-- Exactly the right-hand half of the header, sat on its floor so the box lines up with the
           bottom of the name block however tall either of them grows. The auto start margin is what
           puts it there: growing into the space left over by the name block instead would start the
           box wherever that block happens to end and leave the half-width cap unreached. -->
      <div class="flex flex-col justify-end sm:ms-auto sm:w-1/2 sm:items-end">
        <PersonDetailsBox {details} {genders} onEdit={handleEditDetails} />
      </div>
    </div>

    <nav class="flex shrink-0 gap-2 px-4 sm:px-6 pb-2" aria-label={$t('person_tabs')}>
      {#each tabs as tab (tab.href)}
        <a
          href={tab.href}
          aria-current={tab.isSelected ? 'page' : undefined}
          class="flex place-items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors hover:bg-subtle dark:text-immich-dark-fg dark:hover:bg-immich-dark-gray
          {tab.isSelected ? 'bg-immich-primary/10 text-primary dark:bg-immich-dark-primary/10 dark:text-primary' : ''}"
        >
          <Icon icon={tab.icon} size="1.25em" class="shrink-0" aria-hidden />
          <span>{tab.title}</span>
        </a>
      {/each}
    </nav>
  {/if}

  <div class="grow min-h-0">
    {@render children?.()}
  </div>
</main>
