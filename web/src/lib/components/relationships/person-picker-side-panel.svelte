<script lang="ts">
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { timeBeforeShowLoadingSpinner } from '$lib/constants';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import { getPeopleThumbnailUrl, handlePromiseError } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getCoAppearances, RelationshipGender, type CoAppearanceResponseDto } from '@immich/sdk';
  import { IconButton, LoadingSpinner } from '@immich/ui';
  import { mdiArrowLeftThin } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { linear } from 'svelte/easing';
  import { fly } from 'svelte/transition';

  interface Props {
    subjectId: string;
    onClose: () => void;
    onSelect: (person: CoAppearanceResponseDto) => void;
  }

  let { subjectId, onClose, onSelect }: Props = $props();

  let people: CoAppearanceResponseDto[] = $state([]);
  let isLoadingPeople = $state(false);
  let searchName = $state('');

  const matchesSearch = (name: string, search: string) => {
    const query = search.trim().toLowerCase();
    return name.split(' ').some((part) => part.toLowerCase().startsWith(query));
  };

  // Nothing states a gender for someone whose labels are all neutral, and the ring is left off
  // rather than guessed at: an unringed face means unknown, not neither.
  const genderRing = (gender: CoAppearanceResponseDto['gender']) => {
    switch (gender) {
      case RelationshipGender.Male: {
        return 'ring-2 ring-[royalblue]';
      }
      case RelationshipGender.Female: {
        return 'ring-2 ring-[hotpink]';
      }
      default: {
        return '';
      }
    }
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
      <div class="immich-scrollbar mt-4 flex flex-wrap gap-2 overflow-y-auto">
        {#each matchingPeople as person (person.id)}
          <div class="w-fit">
            <button type="button" class="w-22.5" onclick={() => onSelect(person)}>
              <ImageThumbnail
                curve
                shadow
                url={getPeopleThumbnailUrl(person)}
                altText={person.name}
                title={person.name}
                widthStyle="90px"
                heightStyle="90px"
                class={genderRing(person.gender)}
              />
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
