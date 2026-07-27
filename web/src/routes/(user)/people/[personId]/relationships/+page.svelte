<script lang="ts">
  import { goto } from '$app/navigation';
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { getPersonPageContext } from '$lib/components/faces-page/person-page-context';
  import ControlAppBar from '$lib/components/shared-components/control-app-bar.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import { AppRoute } from '$lib/constants';
  import Portal from '$lib/elements/Portal.svelte';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { deleteRelationship, type PersonRelationshipResponseDto, type RelatedPersonResponseDto } from '@immich/sdk';
  import { Button, Icon } from '@immich/ui';
  import { mdiArrowLeft, mdiClose, mdiPlus } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const personPage = getPersonPageContext();

  let relatedPeople = $derived<RelatedPersonResponseDto[]>(data.relatedPeople);

  // The person and type pickers are separate components; these controls open them once
  // both flows are connected.
  const handleAddRelationship = () => {};
  const handleAddLabel = () => {};
  const handleRelabel = () => {};

  const handleRemove = async (relatedPerson: RelatedPersonResponseDto, relationship: PersonRelationshipResponseDto) => {
    const previous = relatedPeople;

    // Drop the chip, and the whole row with it when it was the last one.
    relatedPeople = relatedPeople
      .map((entry) =>
        entry.id === relatedPerson.id
          ? { ...entry, relationships: entry.relationships.filter(({ id }) => id !== relationship.id) }
          : entry,
      )
      .filter((entry) => entry.relationships.length > 0);

    try {
      await deleteRelationship({ id: relationship.id });
    } catch (error) {
      relatedPeople = previous;
      handleError(error, $t('errors.unable_to_remove_relationship'));
    }
  };
</script>

<!-- The app bar is positioned against the viewport, so it is rendered outside the person page container. -->
<Portal target="body">
  <header>
    <ControlAppBar showBackButton backIcon={mdiArrowLeft} onClose={() => goto(personPage.getPreviousRoute())} />
  </header>
</Portal>

<section class="h-full overflow-y-auto px-4 sm:px-6 pb-6">
  <div class="flex pb-4">
    <Button leadingIcon={mdiPlus} size="small" shape="round" variant="ghost" onclick={handleAddRelationship}>
      {$t('add_relationship')}
    </Button>
  </div>

  {#if relatedPeople.length === 0}
    <EmptyPlaceholder fullWidth title={$t('no_relationships')} text={$t('no_relationships_message')} />
  {:else}
    <ul class="flex flex-col gap-2">
      {#each relatedPeople as relatedPerson (relatedPerson.id)}
        <li class="flex flex-wrap place-items-center gap-x-4 gap-y-2 rounded-2xl p-2 hover:bg-subtle">
          <a href="{AppRoute.PEOPLE}/{relatedPerson.id}" class="flex min-w-48 grow place-items-center gap-3">
            <ImageThumbnail
              circle
              shadow
              url={getPeopleThumbnailUrl(relatedPerson)}
              altText={relatedPerson.name}
              widthStyle="3rem"
              heightStyle="3rem"
            />
            <span class="truncate font-medium text-primary">{relatedPerson.name}</span>
          </a>

          <div class="flex flex-wrap place-items-center gap-2">
            {#each relatedPerson.relationships as relationship (relationship.id)}
              <div class="flex place-items-center rounded-full bg-gray-200 dark:bg-immich-dark-gray">
                <button
                  type="button"
                  class="ps-3 pe-1 py-1 text-sm font-medium text-primary"
                  title={$t('relationship_change_label')}
                  onclick={handleRelabel}
                >
                  {relationship.typeName}
                </button>
                <button
                  type="button"
                  class="pe-2 ps-1 py-1 text-gray-600 dark:text-gray-300 hover:text-primary"
                  title={$t('relationship_remove')}
                  aria-label={$t('relationship_remove')}
                  onclick={() => handleRemove(relatedPerson, relationship)}
                >
                  <Icon icon={mdiClose} size="1em" aria-hidden />
                </button>
              </div>
            {/each}

            <button
              type="button"
              class="rounded-full border border-gray-300 dark:border-immich-dark-gray p-1.5 text-gray-600 dark:text-gray-300 hover:text-primary"
              title={$t('relationship_add_label')}
              aria-label={$t('relationship_add_label')}
              onclick={handleAddLabel}
            >
              <Icon icon={mdiPlus} size="1em" aria-hidden />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>
