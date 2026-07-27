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
    /** The person whose page the type is being chosen from. */
    subjectId: string;
    /** The other person: the one the type will describe. */
    counterpartId?: string;
    /**
     * The type the two people already hold, when the panel was opened from an existing label. It is
     * marked in the list so the label being changed — and the inverse it reads as from the other
     * person's page — is visible beside whatever it is being changed to.
     */
    selectedTypeId?: string;
    onClose: () => void;
    /** Shown as a separate control when closing this panel goes back a step rather than ending the flow. */
    onCancel?: () => void;
    onSelect: (type: RelationshipTypeResponseDto) => void;
  }

  let { subjectId, counterpartId, selectedTypeId, onClose, onCancel, onSelect }: Props = $props();

  /** Brings the marked entry into view, since the list is long enough to hide it below the fold. */
  const reveal = (node: HTMLElement, isSelected: boolean) => {
    if (isSelected) {
      node.scrollIntoView({ block: 'nearest' });
    }
  };

  let types: RelationshipTypeResponseDto[] = $state([]);
  let isLoadingTypes = $state(false);
  let searchName = $state('');

  const matchesSearch = (type: RelationshipTypeResponseDto, search: string) => {
    const query = search.trim().toLowerCase();
    return [type.name, type.inverseName].some((value) =>
      value.split(' ').some((part) => part.toLowerCase().startsWith(query)),
    );
  };

  // Both halves of a pair are listed, since choosing "Parent" rather than "Child" is how the
  // direction is picked. Searching narrows on either name for the same reason.
  let matchingTypes = $derived(searchName.trim() ? types.filter((type) => matchesSearch(type, searchName)) : types);

  // The server puts the types the two people's ages fit at the front and flags them, so the list
  // only has to keep that order and draw the line between the two groups.
  let suggestedTypes = $derived(matchingTypes.filter((type) => type.suggested));
  let otherTypes = $derived(matchingTypes.filter((type) => !type.suggested));

  const loadTypes = async () => {
    const timeout = setTimeout(() => (isLoadingTypes = true), timeBeforeShowLoadingSpinner);
    try {
      types = await getRelationshipTypes({ subjectId, counterpartId });
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
      // Where a saved type belongs depends on the age range it was given, which is the server's
      // ordering to make, so the list is read back rather than patched.
      await loadTypes();
    }
  };

  const handleEdit = async (type: RelationshipTypeResponseDto) => {
    const result = await modalManager.show(RelationshipTypeModal, { type });
    if (!result) {
      return;
    }

    if (result.action === 'saved') {
      await loadTypes();
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
    <!-- The panel only opens because someone asked for it, so typing is what they came to do. -->
    <SearchBar placeholder={$t('search')} bind:name={searchName} showLoadingSpinner={false} focusOnMount />
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
      <div class="immich-scrollbar mt-4 overflow-y-auto">
        <!-- The two groups are only worth naming when both are there; on their own the heading
             would label the whole list. -->
        {#if suggestedTypes.length > 0 && otherTypes.length > 0}
          <h2 class="px-3 pb-1 text-xs font-medium text-gray-600 uppercase dark:text-gray-400">
            {$t('relationship_types_suggested')}
          </h2>
        {/if}
        {@render typeList(suggestedTypes)}
        {#if suggestedTypes.length > 0 && otherTypes.length > 0}
          <h2 class="px-3 pt-3 pb-1 text-xs font-medium text-gray-600 uppercase dark:text-gray-400">
            {$t('relationship_types_other')}
          </h2>
        {/if}
        {@render typeList(otherTypes)}
      </div>
    {/if}
  </div>
</section>

{#snippet typeList(entries: RelationshipTypeResponseDto[])}
  <ul class="flex flex-col gap-1">
    {#each entries as type (type.id)}
      <li
        class="flex place-items-center gap-1 rounded-lg hover:bg-subtle {type.id === selectedTypeId
          ? 'bg-subtle ring-1 ring-primary'
          : ''}"
        aria-current={type.id === selectedTypeId ? 'true' : undefined}
        use:reveal={type.id === selectedTypeId}
      >
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
{/snippet}
