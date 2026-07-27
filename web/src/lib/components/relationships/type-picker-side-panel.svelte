<script lang="ts">
  import { timeBeforeShowLoadingSpinner } from '$lib/constants';
  import SearchBar from '$lib/elements/SearchBar.svelte';
  import RelationshipTypeModal from '$lib/modals/RelationshipTypeModal.svelte';
  import { handlePromiseError } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { getRelationshipTypes, type RelationshipTypeResponseDto } from '@immich/sdk';
  import { Button, Icon, IconButton, LoadingSpinner, modalManager } from '@immich/ui';
  import { mdiArrowLeftThin, mdiClose, mdiPencilOutline, mdiPlus } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import { linear } from 'svelte/easing';
  import { fly } from 'svelte/transition';

  interface Props {
    onClose: () => void;
    /** Shown as a separate control when closing this panel goes back a step rather than ending the flow. */
    onCancel?: () => void;
    onSelect: (type: RelationshipTypeResponseDto) => void;
  }

  let { onClose, onCancel, onSelect }: Props = $props();

  let types: RelationshipTypeResponseDto[] = $state([]);
  let isLoadingTypes = $state(false);
  let searchName = $state('');

  // The server orders by name then inverse name; new and renamed types are put back in that order
  // rather than the list being reloaded.
  const byName = (a: RelationshipTypeResponseDto, b: RelationshipTypeResponseDto) =>
    a.name.localeCompare(b.name) || a.inverseName.localeCompare(b.inverseName);

  const matchesSearch = (type: RelationshipTypeResponseDto, search: string) => {
    const query = search.trim().toLowerCase();
    return [type.name, type.inverseName].some((value) =>
      value.split(' ').some((part) => part.toLowerCase().startsWith(query)),
    );
  };

  // Both halves of a pair are listed, since choosing "Parent" rather than "Child" is how the
  // direction is picked. Searching narrows on either name for the same reason.
  let matchingTypes = $derived(searchName.trim() ? types.filter((type) => matchesSearch(type, searchName)) : types);

  const loadTypes = async () => {
    const timeout = setTimeout(() => (isLoadingTypes = true), timeBeforeShowLoadingSpinner);
    try {
      types = await getRelationshipTypes();
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_relationship_types'));
    } finally {
      clearTimeout(timeout);
      isLoadingTypes = false;
    }
  };

  const handleCreate = async () => {
    const result = await modalManager.show(RelationshipTypeModal, {});
    if (result?.action === 'saved') {
      types = [...types, result.type].sort(byName);
    }
  };

  const handleEdit = async (type: RelationshipTypeResponseDto) => {
    const result = await modalManager.show(RelationshipTypeModal, { type });
    if (!result) {
      return;
    }

    if (result.action === 'saved') {
      const saved = result.type;
      types = types
        .map((entry) => {
          if (entry.id === saved.id) {
            return saved;
          }
          // The other half of the pair holds the same two names the other way round.
          return entry.id === saved.inverseId ? { ...entry, name: saved.inverseName, inverseName: saved.name } : entry;
        })
        .sort(byName);
      return;
    }

    // Deleting either half deletes both, so both leave the list.
    types = types.filter((entry) => entry.id !== type.id && entry.id !== type.inverseId);
  };

  onMount(() => {
    handlePromiseError(loadTypes());
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
    <p class="flex grow text-lg text-immich-fg dark:text-immich-dark-fg">{$t('relationship_select_type')}</p>
    {#if onCancel}
      <IconButton
        color="secondary"
        variant="ghost"
        shape="round"
        icon={mdiClose}
        aria-label={$t('cancel')}
        title={$t('cancel')}
        onclick={onCancel}
      />
    {/if}
  </div>

  <div class="px-4 pt-4">
    <SearchBar placeholder={$t('search')} bind:name={searchName} showLoadingSpinner={false} />
  </div>

  <div class="px-4 py-4 text-sm">
    <Button leadingIcon={mdiPlus} size="small" shape="round" variant="ghost" onclick={handleCreate}>
      {$t('relationship_type_new')}
    </Button>

    {#if isLoadingTypes}
      <div class="mt-4 flex w-full justify-center">
        <LoadingSpinner />
      </div>
    {:else if matchingTypes.length === 0}
      <p class="mt-4 text-center">{$t('no_relationship_types_found')}</p>
    {:else}
      <ul class="immich-scrollbar mt-4 flex flex-col gap-1 overflow-y-auto">
        {#each matchingTypes as type (type.id)}
          <li class="flex place-items-center gap-1 rounded-lg hover:bg-subtle">
            <button
              type="button"
              class="flex min-w-0 grow flex-col place-items-start px-3 py-2 text-start"
              onclick={() => onSelect(type)}
            >
              <span class="w-full truncate font-medium text-primary">{type.name}</span>
              <!-- Type names are not unique, so the inverse is what tells two "Uncle"s apart. -->
              <span class="w-full truncate text-xs text-gray-600 dark:text-gray-400">
                {$t('relationship_type_inverse', { values: { name: type.inverseName } })}
              </span>
            </button>
            <button
              type="button"
              class="rounded-full p-2 text-gray-600 dark:text-gray-300 hover:text-primary"
              title={$t('relationship_type_edit')}
              aria-label={$t('relationship_type_edit')}
              onclick={() => handleEdit(type)}
            >
              <Icon icon={mdiPencilOutline} size="1.25em" aria-hidden />
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</section>
