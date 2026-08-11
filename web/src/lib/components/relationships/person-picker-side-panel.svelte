<script lang="ts">
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { timeBeforeShowLoadingSpinner } from '$lib/constants';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import { getPeopleThumbnailUrl, handlePromiseError } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { genderRingClass } from '$lib/utils/person-gender';
  import { idsInRange } from '$lib/utils/range-select';
  import { getCoAppearances, type CoAppearanceResponseDto } from '@immich/sdk';
  import { Button, Icon, IconButton, LoadingSpinner } from '@immich/ui';
  import { mdiArrowLeftThin, mdiCheck } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { linear } from 'svelte/easing';
  import { fly } from 'svelte/transition';

  interface Props {
    subjectId: string;
    onClose: () => void;
    /** Everyone chosen at once. A plain click hands over one person; ctrl- and shift-clicking gather several. */
    onSelect: (people: CoAppearanceResponseDto[]) => void;
  }

  let { subjectId, onClose, onSelect }: Props = $props();

  let people: CoAppearanceResponseDto[] = $state([]);
  let isLoadingPeople = $state(false);
  let searchName = $state('');
  let selectedIds = $state<string[]>([]);

  /** The last person ticked on their own, which is the end a shift-click draws its range from. */
  let anchorId = $state<string>();

  // Read back from the list so the people handed over are in the order they are shown in, not the
  // order they happened to be ticked in.
  let selectedPeople = $derived(people.filter((person) => selectedIds.includes(person.id)));

  const handleClick = (event: MouseEvent, person: CoAppearanceResponseDto) => {
    // Shift takes everyone from the last one ticked to this one, over the list as it stands, so a
    // search narrows what a range can reach. The anchor stays put afterwards, so the same range can
    // be redrawn shorter or longer without starting again.
    if (event.shiftKey && anchorId) {
      selectedIds = [...new Set([...selectedIds, ...idsInRange(matchingPeople, anchorId, person.id)])];
      return;
    }

    // Ctrl — or Cmd — gathers people up for one trip through the type step. A plain click stays the
    // single-person shortcut it has always been, and starts over from whoever it landed on.
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      selectedIds = selectedIds.includes(person.id)
        ? selectedIds.filter((id) => id !== person.id)
        : [...selectedIds, person.id];
      anchorId = person.id;
      return;
    }

    onSelect([person]);
  };

  const matchesSearch = (name: string, search: string) => {
    const query = search.trim().toLowerCase();
    return name.split(' ').some((part) => part.toLowerCase().startsWith(query));
  };

  // The candidates already arrive ordered by co-appearance, so searching narrows that list
  // in place rather than asking the server for a differently ordered one.
  let matchingPeople = $derived(
    searchName.trim() ? people.filter((person) => matchesSearch(person.name, searchName)) : people,
  );

  const loadPeople = async () => {
    const timeout = setTimeout(() => (isLoadingPeople = true), timeBeforeShowLoadingSpinner);
    try {
      people = await getCoAppearances({ id: subjectId });
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_people'));
    } finally {
      clearTimeout(timeout);
      isLoadingPeople = false;
    }
  };

  onMount(() => {
    handlePromiseError(loadPeople());
  });
</script>

<section
  transition:fly={{ x: 360, duration: 100, easing: linear }}
  class="absolute top-0 h-full w-90 overflow-x-hidden p-2 dark:text-immich-dark-fg bg-light"
>
  <div class="flex place-items-center gap-2">
    <IconButton
      color="secondary"
      variant="ghost"
      shape="round"
      icon={mdiArrowLeftThin}
      aria-label={$t('back')}
      onclick={onClose}
    />
    <p class="flex text-lg text-immich-fg dark:text-immich-dark-fg">{$t('relationship_select_person')}</p>
  </div>

  <div class="px-4 pt-4">
    <!-- The panel only opens because someone asked for it, so typing is what they came to do. -->
    <SearchBar placeholder={$t('search_people')} bind:name={searchName} showLoadingSpinner={false} focusOnMount />
  </div>

  <!-- A gathered selection has nothing to advance it, since the click that would have advanced it is
       the one adding to it. -->
  {#if selectedPeople.length > 0}
    <div class="px-4 pt-4">
      <Button size="small" shape="round" onclick={() => onSelect(selectedPeople)}>{$t('next')}</Button>
    </div>
  {/if}

  <div class="px-4 py-4 text-sm">
    {#if isLoadingPeople}
      <div class="flex w-full justify-center">
        <LoadingSpinner />
      </div>
    {:else if people.length === 0}
      <!-- Nobody is offered at all, rather than nobody matching the search: everyone available is
           already related to this person. -->
      <p class="mt-4 text-center">{$t('relationship_all_people_assigned')}</p>
    {:else if matchingPeople.length === 0}
      <p class="mt-4 text-center">{$t('no_people_found')}</p>
    {:else}
      <div class="immich-scrollbar mt-4 flex flex-wrap gap-2 overflow-y-auto select-none">
        {#each matchingPeople as person (person.id)}
          <div class="w-fit">
            <button
              type="button"
              class="w-22.5"
              aria-pressed={selectedIds.includes(person.id)}
              onclick={(event) => handleClick(event, person)}
            >
              <div class="relative">
                <ImageThumbnail
                  curve
                  shadow
                  url={getPeopleThumbnailUrl(person)}
                  altText={person.name}
                  title={person.name}
                  widthStyle="90px"
                  heightStyle="90px"
                  class={genderRingClass(person.gender)}
                />
                {#if selectedIds.includes(person.id)}
                  <span class="absolute -top-1 -end-1 rounded-full bg-primary p-0.5 text-white" title={$t('selected')}>
                    <Icon icon={mdiCheck} size="1em" aria-hidden />
                  </span>
                {/if}
              </div>
              <p class="mt-1 truncate font-medium" title={person.name}>{person.name}</p>
              {#if person.sharedAssets > 0}
                <p class="truncate text-xs text-gray-600 dark:text-gray-400">
                  {$t('relationship_shared_assets_count', { values: { count: person.sharedAssets } })}
                </p>
              {/if}
            </button>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</section>
