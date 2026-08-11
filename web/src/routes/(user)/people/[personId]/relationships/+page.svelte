<script lang="ts">
  import { goto } from '$app/navigation';
  import { shortcuts } from '$lib/actions/shortcut';
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { getPersonPageContext } from '$lib/components/faces-page/person-page-context';
  import PersonPickerSidePanel from '$lib/components/relationships/person-picker-side-panel.svelte';
  import TypePickerSidePanel from '$lib/components/relationships/type-picker-side-panel.svelte';
  import ControlAppBar from '$lib/components/shared-components/control-app-bar.svelte';
  import EmptyPlaceholder from '$lib/components/shared-components/empty-placeholder.svelte';
  import { AppRoute } from '$lib/constants';
  import Portal from '$lib/elements/Portal.svelte';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { genderRingClass } from '$lib/utils/person-gender';
  import {
    createRelationship,
    deleteRelationship,
    getRelatedPeople,
    setRelatedPeopleOrder,
    updateRelationship,
    type CoAppearanceResponseDto,
    type PersonRelationshipResponseDto,
    type RelatedPersonResponseDto,
    type RelationshipTypeResponseDto,
  } from '@immich/sdk';
  import { Button, Icon } from '@immich/ui';
  import { mdiArrowLeft, mdiClose, mdiDragHorizontalVariant, mdiPlus } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  const personPage = getPersonPageContext();

  let relatedPeople = $derived<RelatedPersonResponseDto[]>(data.relatedPeople);

  /**
   * What the pickers are showing. Nothing is written until a type has been chosen, so the type
   * step carries whatever the type will be applied to.
   */
  type PickerFlow =
    | { step: 'person' }
    | {
        step: 'type';
        target:
          | { kind: 'add'; counterpartIds: string[] }
          | { kind: 'relabel'; relatedPerson: RelatedPersonResponseDto; relationship: PersonRelationshipResponseDto };
        /** True when the type step was reached through the person step, so closing it goes back. */
        hasPersonStep: boolean;
      };

  let flow: PickerFlow | undefined = $state();
  let hasPersonStep = $derived(flow?.step === 'type' && flow.hasPersonStep);

  // Whoever the type will describe, so the type picker can order itself by the age difference
  // between the two. Adding names them directly; relabelling takes them from the row.
  //
  // A batch has nobody in particular to compare against, so it is left unnamed: an age or a gender
  // read off one of several people would narrow the list for all of them.
  let typeCounterpartId = $derived.by(() => {
    if (flow?.step !== 'type') {
      return;
    }

    if (flow.target.kind === 'relabel') {
      return flow.target.relatedPerson.id;
    }

    return flow.target.counterpartIds.length === 1 ? flow.target.counterpartIds[0] : undefined;
  });

  // Only a relabel has a label to mark: adding starts from nothing, even for a person who already
  // holds other labels.
  let selectedTypeId = $derived(
    flow?.step === 'type' && flow.target.kind === 'relabel' ? flow.target.relationship.typeId : undefined,
  );

  const closeFlow = () => (flow = undefined);

  const handleAddRelationship = () => (flow = { step: 'person' });

  // "+" is the same act as the button it shadows, so it does nothing while a picker is already
  // open. Both spellings are bound: the key is shifted on some layouts and bare on a numpad.
  const addRelationshipShortcuts = [{ key: '+' }, { key: '+', shift: true }].map((shortcut) => ({
    shortcut,
    onShortcut: () => {
      if (!flow) {
        handleAddRelationship();
      }
    },
  }));

  const handleAddLabel = (relatedPerson: RelatedPersonResponseDto) =>
    (flow = { step: 'type', target: { kind: 'add', counterpartIds: [relatedPerson.id] }, hasPersonStep: false });

  const handleRelabel = (relatedPerson: RelatedPersonResponseDto, relationship: PersonRelationshipResponseDto) =>
    (flow = { step: 'type', target: { kind: 'relabel', relatedPerson, relationship }, hasPersonStep: false });

  const handlePersonSelected = (people: CoAppearanceResponseDto[]) =>
    (flow = {
      step: 'type',
      target: { kind: 'add', counterpartIds: people.map(({ id }) => id) },
      hasPersonStep: true,
    });

  // The back arrow on the type step returns to the person step when there is one; otherwise it
  // is the only way out and ends the flow.
  const handleTypeStepClose = () => (flow = hasPersonStep ? { step: 'person' } : undefined);

  const refresh = async () => {
    try {
      relatedPeople = await getRelatedPeople({ id: personPage.getPerson().id });
    } catch (error) {
      handleError(error, $t('errors.unable_to_load_relationships'));
    }
  };

  const handleTypeSelected = async (types: RelationshipTypeResponseDto[]) => {
    const current = flow;
    if (current?.step !== 'type' || types.length === 0) {
      return;
    }

    flow = undefined;

    await (current.target.kind === 'add'
      ? addRelationships(current.target.counterpartIds, types)
      : // Relabelling swaps one label for one other, so the picker never gathers more than one.
        relabel(current.target.relatedPerson, current.target.relationship, types[0]));
  };

  /** Every chosen label applied to every chosen person: three cousins are three people, one type. */
  const addRelationships = async (counterpartIds: string[], types: RelationshipTypeResponseDto[]) => {
    try {
      for (const counterpartId of counterpartIds) {
        for (const type of types) {
          await createRelationship({
            relationshipCreateDto: { subjectId: personPage.getPerson().id, counterpartId, typeId: type.id },
          });
        }
      }
    } catch (error) {
      // Whatever was written before the failure stays written, so the refresh below still runs.
      handleError(error, $t('errors.unable_to_add_relationship'));
    }

    // The stored rows may be canonicalised or already exist from the other end, so the list is
    // read back rather than guessed at.
    await refresh();
  };

  const relabel = async (
    relatedPerson: RelatedPersonResponseDto,
    relationship: PersonRelationshipResponseDto,
    type: RelationshipTypeResponseDto,
  ) => {
    if (type.id === relationship.typeId) {
      return;
    }

    const previous = relatedPeople;

    relatedPeople = relatedPeople.map((entry) =>
      entry.id === relatedPerson.id
        ? {
            ...entry,
            relationships: entry.relationships.map((current) =>
              current.id === relationship.id
                ? {
                    ...current,
                    typeId: type.id,
                    typeName: type.name,
                    inverseId: type.inverseId,
                    inverseName: type.inverseName,
                    // What the new label states is the server's to say, so the chip goes unringed
                    // rather than keeping the old ring until the list is read back.
                    inverseGender: null,
                  }
                : current,
            ),
          }
        : entry,
    );

    try {
      // The label describes the other person, so the new type is read from this page's person.
      await updateRelationship({
        id: relationship.id,
        relationshipUpdateDto: { subjectId: personPage.getPerson().id, typeId: type.id },
      });
    } catch (error) {
      relatedPeople = previous;
      handleError(error, $t('errors.unable_to_change_relationship'));
      return;
    }

    // Relabelling onto a type the two people already hold collapses two chips into one.
    await refresh();
  };

  /** The person currently being dragged. The list reorders live underneath them. */
  let draggingId: string | undefined = $state();

  const persistOrder = async () => {
    const ordered = relatedPeople.map(({ id }) => id);

    try {
      await setRelatedPeopleOrder({
        id: personPage.getPerson().id,
        relationshipOrderUpdateDto: { relatedPersonIds: ordered },
      });
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_relationship_order'));
      // The order on screen is no longer the stored one, so take the stored one back.
      await refresh();
    }
  };

  const moveTo = (from: number, to: number) => {
    if (to < 0 || to >= relatedPeople.length || from === to) {
      return false;
    }

    const reordered = [...relatedPeople];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    relatedPeople = reordered;

    return true;
  };

  const handleDragStart = (event: DragEvent, relatedPerson: RelatedPersonResponseDto) => {
    draggingId = relatedPerson.id;

    // Firefox does not start a drag at all unless something is on the transfer.
    event.dataTransfer?.setData('text/plain', relatedPerson.id);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (event: DragEvent, index: number) => {
    if (draggingId === undefined) {
      return;
    }

    // Without this the browser refuses the drop and animates the row back.
    event.preventDefault();

    moveTo(
      relatedPeople.findIndex(({ id }) => id === draggingId),
      index,
    );
  };

  const handleDragEnd = async () => {
    if (draggingId === undefined) {
      return;
    }

    draggingId = undefined;
    await persistOrder();
  };

  const handleMoveKey = async (event: KeyboardEvent, index: number) => {
    const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : undefined;
    if (to === undefined) {
      return;
    }

    // Keep the arrow keys from scrolling the page out from under the row being moved.
    event.preventDefault();

    if (moveTo(index, to)) {
      await persistOrder();
    }
  };

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

<svelte:document use:shortcuts={addRelationshipShortcuts} />

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
      {#each relatedPeople as relatedPerson, index (relatedPerson.id)}
        <li
          class="flex flex-wrap place-items-center gap-x-4 gap-y-2 rounded-2xl p-2 hover:bg-subtle {draggingId ===
          relatedPerson.id
            ? 'opacity-50'
            : ''}"
          ondragover={(event) => handleDragOver(event, index)}
        >
          <button
            type="button"
            class="shrink-0 cursor-grab rounded-full p-1 text-gray-500 dark:text-gray-400 hover:text-primary active:cursor-grabbing"
            draggable="true"
            title={$t('relationship_reorder_hint')}
            aria-label={$t('relationship_reorder')}
            ondragstart={(event) => handleDragStart(event, relatedPerson)}
            ondragend={handleDragEnd}
            onkeydown={(event) => handleMoveKey(event, index)}
          >
            <Icon icon={mdiDragHorizontalVariant} size="1.25em" aria-hidden />
          </button>

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
              <!-- The label names the other person, so it is its inverse that states what this
                   page's person is: a "Father" here rings the chip pink for the daughter reading it. -->
              <div
                class="flex place-items-center rounded-full bg-gray-200 dark:bg-immich-dark-gray {genderRingClass(
                  relationship.inverseGender,
                )}"
              >
                <button
                  type="button"
                  class="ps-3 pe-1 py-1 text-sm font-medium text-primary"
                  title={$t('relationship_change_label')}
                  onclick={() => handleRelabel(relatedPerson, relationship)}
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
              onclick={() => handleAddLabel(relatedPerson)}
            >
              <Icon icon={mdiPlus} size="1em" aria-hidden />
            </button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<!-- The pickers are fly-ins pinned to the viewport edge, so they sit outside the page container too. -->
{#if flow}
  <Portal target="body">
    <div class="fixed top-0 end-0 z-30 h-full w-90">
      {#if flow.step === 'person'}
        <PersonPickerSidePanel
          subjectId={personPage.getPerson().id}
          onClose={closeFlow}
          onSelect={handlePersonSelected}
        />
      {:else}
        <TypePickerSidePanel
          subjectId={personPage.getPerson().id}
          counterpartId={typeCounterpartId}
          {selectedTypeId}
          allowMultiple={flow.target.kind === 'add'}
          onClose={handleTypeStepClose}
          onCancel={hasPersonStep ? closeFlow : undefined}
          onSelect={handleTypeSelected}
        />
      {/if}
    </div>
  </Portal>
{/if}
