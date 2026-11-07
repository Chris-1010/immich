<script lang="ts">
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import DetailDateInput from '$lib/components/faces-page/detail-date-input.svelte';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { handleError } from '$lib/utils/handle-error';
  import { isFreeTextDetail } from '$lib/utils/contact-fields';
  import { sortPastDetails } from '$lib/utils/person-detail-dates';
  import {
    PersonDetailDatePrecision,
    addPersonDetails,
    getPersonDetailConflicts,
    getPersonDetailKeys,
    getPersonDetailValues,
    updatePersonDetails,
    type PersonDetailConflictPersonResponseDto,
    type PersonDetailResponseDto,
    type PersonDetailSuggestionResponseDto,
    type PersonResponseDto,
  } from '@immich/sdk';
  import { Button, Checkbox, HStack, Icon, Input, Label, Modal, ModalBody, ModalFooter, Text } from '@immich/ui';
  import {
    mdiCheck,
    mdiClose,
    mdiDragHorizontalVariant,
    mdiPlus,
    mdiRefresh,
    mdiSubdirectoryArrowRight,
    mdiTagOutline,
  } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    /** The person whose whole list is being rewritten. Absent when adding to several people at once. */
    personId?: string;
    /** The people a bulk insert is for. Their presence is what puts the modal in bulk mode. */
    people?: PersonResponseDto[];
    details?: PersonDetailResponseDto[];
    onClose: (result?: PersonDetailResponseDto[]) => void;
  }

  let { personId, people = [], details = [], onClose }: Props = $props();

  /**
   * Adding to many people rather than rewriting one.
   *
   * What is on screen is what will be added, so nothing anyone already holds is shown: a list of
   * everything twelve people record between them is not something anyone could edit, and the one
   * part of it that matters — where what is typed here collides with what they have — is reported
   * per row instead.
   */
  const isBulk = $derived(people.length > 0);

  /** Long enough that typing a word does not fire a request per letter, short enough to feel live. */
  const SUGGESTION_DEBOUNCE = 200;

  /** One editable line, at either level. `id` is absent on something that does not exist yet. */
  type Field = { rowId: string; id?: string; key: string; value: string };
  /**
   * Since and Until, always sent back. The whole list is saved at once, so a row sent back without
   * them would come back Current and undated. Never undefined: a null `until` is what makes a row
   * Current, and an undefined one would be taken for Past by everything that sorts the two apart.
   */
  type Dates = Pick<PersonDetailResponseDto, 'since' | 'sincePrecision' | 'until' | 'untilPrecision'>;
  /**
   * The contact-field kind and pin, carried through untouched for the same reason as the dates: a
   * Home sent back without its kind would come back as a free-text detail, and without its pin
   * would drop off the location picker.
   */
  type Contact = Pick<PersonDetailResponseDto, 'kind' | 'latitude' | 'longitude'>;
  type Row = Field &
    Dates &
    Contact & {
      subdetails: Field[];
      /** What the row held when the modal opened, which is what a changed value is measured against. */
      original?: { key: string; value: string };
      /**
       * Whether what this row replaces goes to Past rather than being overwritten. For a saved row,
       * the old value once the value is changed; in bulk, every value the row is replacing.
       * Ticked by default, since history is the thing that cannot be got back.
       */
      archive: boolean;
    };

  /**
   * The key input of each line, so a line added by a button can be focused.
   *
   * Seeded with null as the line is built. `bind:ref` refuses to bind an absent entry, because the
   * prop it binds to falls back to null and a binding cannot supply undefined against a fallback —
   * leaving the entry out throws while the line renders, which reads as the button doing nothing.
   */
  let keyInputs = $state<Record<string, HTMLInputElement | null>>({});

  let nextRowId = 0;
  const asField = (field?: { id?: string; key: string; value: string }): Field => {
    const row = {
      rowId: `row-${nextRowId++}`,
      id: field?.id,
      key: field?.key ?? '',
      value: field?.value ?? '',
    };

    keyInputs[row.rowId] = null;

    return row;
  };

  const asRow = (detail?: PersonDetailResponseDto): Row => ({
    ...asField(detail),
    subdetails: (detail?.subdetails ?? []).map((sub) => asField(sub)),
    since: detail?.since ?? null,
    sincePrecision: detail?.sincePrecision ?? null,
    until: detail?.until ?? null,
    untilPrecision: detail?.untilPrecision ?? null,
    kind: detail?.kind ?? null,
    latitude: detail?.latitude ?? null,
    longitude: detail?.longitude ?? null,
    original: detail && { key: detail.key, value: detail.value },
    archive: true,
  });

  /**
   * Whether there is any free-text detail to edit, Current or Past. Contact fields do not count:
   * they are edited from their chips, so a person holding only a Home has nothing here yet.
   */
  const hasFreeText = details.some((detail) => isFreeTextDetail(detail));

  // A person with nothing recorded opens on an empty row rather than on a bare "+ Add detail":
  // pressing "Add details" already said what was wanted, and asking for it twice is a dead end.
  // Contact fields still go in `rows`, hidden or not, since the save replaces the whole list.
  let rows = $state<Row[]>([...details.map((detail) => asRow(detail)), ...(hasFreeText ? [] : [asRow()])]);

  /**
   * Which half of the list is on show, as in the person's header. There is only Current until
   * something has been ended, and a bulk add has no Past at all: it carries no dates.
   */
  let tab = $state<'current' | 'past'>('current');

  /**
   * In the order they were arranged in, which is the order they are saved in. Current contact
   * fields are left out, as in the header box: their chips are where they are edited. Past keeps
   * them, since an ended Home is history like any other.
   */
  const currentRows = $derived(rows.filter((row) => row.until === null && isFreeTextDetail(row)));
  /** Most recently ended first. Their manual order means nothing once they are history. */
  const pastRows = $derived(sortPastDetails(rows));

  // Read through here rather than from `tab`, so restoring the last Past row never leaves an empty
  // Past tab drawn with no toggle left to leave it by.
  const activeTab = $derived(!isBulk && pastRows.length > 0 ? tab : 'current');
  const shownRows = $derived(activeTab === 'current' ? currentRows : pastRows);

  const tabs = $derived([
    { id: 'current' as const, label: $t('details_current') },
    { id: 'past' as const, label: $t('details_past', { values: { count: pastRows.length } }) },
  ]);

  /**
   * The first of this month: what End and an archive stamp as Until. Month precision, since "this
   * month" is as much as anyone knows about a fact they are recording the end of just now.
   */
  const thisMonth = () => DateTime.now().startOf('month').toISODate()!;

  let draggingRowId = $state<string>();
  let activeField = $state<{ rowId: string; field: 'key' | 'value' }>();
  let suggestions = $state<PersonDetailSuggestionResponseDto[]>([]);
  let isSaving = $state(false);

  /** Which suggestion the arrow keys have moved onto. Nothing until they are used. */
  let highlighted = $state(-1);

  /**
   * Who among the selected people already records each typed key, by the lowercased key, and which
   * of them the owner has since asked to overwrite rather than append to.
   */
  let conflicts = $state<Record<string, PersonDetailConflictPersonResponseDto[]>>({});
  let replacing = $state<Record<string, string[]>>({});

  /**
   * Where the open suggestion list sits, in viewport coordinates.
   *
   * The list is anchored to the viewport rather than to the field it belongs to, because the modal
   * card clips its own overflow: a list positioned inside a row is cut off at the edge of the card
   * the moment it opens, which reads as the field having no suggestions at all.
   */
  let anchor = $state<{ top: number; left: number; width: number }>();

  let debounce: ReturnType<typeof setTimeout> | undefined;
  let conflictDebounce: ReturnType<typeof setTimeout> | undefined;

  // Nothing recorded yet means the row waiting on open is the only thing to type in, so put the
  // caret there instead of making it the first thing to click.
  onMount(() => {
    if (!hasFreeText) {
      keyInputs[rows.at(-1)!.rowId]?.focus();
    }
  });

  /** The line a rowId names, whichever level it is on, and the detail above it if it is a subdetail. */
  const locate = (rowId: string): { field: Field; parent?: Row } | undefined => {
    for (const row of rows) {
      if (row.rowId === rowId) {
        return { field: row };
      }

      const sub = row.subdetails.find((subdetail) => subdetail.rowId === rowId);
      if (sub) {
        return { field: sub, parent: row };
      }
    }
  };

  /**
   * Loads what the library already holds for whichever field is being typed in. Keys come from
   * every person of the owner; values only mean something under a key, so they are scoped to the
   * one on the line and refetched whenever it changes.
   *
   * A subdetail is scoped further, to the key of the detail above it, since the years worth
   * offering under a school are the ones already written under a school.
   */
  const loadSuggestions = (rowId: string, field: 'key' | 'value') => {
    const fetchNow = async () => {
      // The field may have moved on while the request was in flight.
      if (activeField?.rowId !== rowId || activeField.field !== field) {
        return;
      }

      const found = locate(rowId);
      if (!found) {
        return;
      }

      const parentKey = found.parent?.key.trim() || undefined;

      try {
        suggestions =
          field === 'key'
            ? await getPersonDetailKeys({ term: found.field.key, parentKey })
            : found.field.key.trim()
              ? await getPersonDetailValues({ detailKey: found.field.key, term: found.field.value, parentKey })
              : [];
      } catch {
        // Suggestions are a convenience: a page that cannot offer them still saves what is typed.
        suggestions = [];
      }

      highlighted = -1;
    };

    clearTimeout(debounce);
    debounce = setTimeout(() => void fetchNow(), SUGGESTION_DEBOUNCE);
  };

  const handleFocus = (event: FocusEvent, rowId: string, field: 'key' | 'value') => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    anchor = { top: rect.bottom + 4, left: rect.left, width: rect.width };

    activeField = { rowId, field };
    suggestions = [];
    highlighted = -1;
    loadSuggestions(rowId, field);
  };

  /**
   * Closes the list once the field is left. Safe against a suggestion being picked, because the
   * pick runs on mousedown and blur only follows it.
   */
  const handleBlur = () => {
    activeField = undefined;
    suggestions = [];
    highlighted = -1;
  };

  const handleInput = (rowId: string, field: 'key' | 'value') => {
    if (activeField?.rowId === rowId && activeField.field === field) {
      loadSuggestions(rowId, field);
    }
  };

  /**
   * Snaps a typed key onto the casing the library already uses, so "hometown" joins the "Hometown"
   * everyone else is grouped under. The server does this again on write — this is here so the
   * change is visible before saving rather than surprising afterwards.
   */
  const handleKeyBlur = async (rowId: string) => {
    handleBlur();

    const found = locate(rowId);
    const typed = found?.field.key.trim();
    if (!found || !typed) {
      return;
    }

    try {
      const known = await getPersonDetailKeys({ term: typed, parentKey: found.parent?.key.trim() || undefined });
      const match = known.find(({ value }) => value.toLowerCase() === typed.toLowerCase());
      found.field.key = match?.value ?? typed;
    } catch {
      found.field.key = typed;
    }
  };

  const applySuggestion = (value: string) => {
    const active = activeField;
    const found = active && locate(active.rowId);
    if (!active || !found) {
      return;
    }

    found.field[active.field] = value;
    suggestions = [];
    highlighted = -1;
  };

  /**
   * Moves through the open list and picks from it.
   *
   * Nothing is highlighted until an arrow key says so, which is what keeps Enter meaning "save
   * what I typed" for anyone who never looked at the list. Once something is highlighted, Enter
   * takes it and stops there rather than also submitting the form underneath.
   */
  const handleFieldKeydown = (event: KeyboardEvent) => {
    if (suggestions.length === 0) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        highlighted = (highlighted + 1) % suggestions.length;
        break;
      }

      case 'ArrowUp': {
        event.preventDefault();
        highlighted = (highlighted <= 0 ? suggestions.length : highlighted) - 1;
        break;
      }

      case 'Enter': {
        if (highlighted >= 0) {
          event.preventDefault();
          applySuggestion(suggestions[highlighted].value);
        }
        break;
      }

      case 'Escape': {
        // Stops the modal closing along with the list, which is not what was being dismissed.
        event.preventDefault();
        event.stopPropagation();
        suggestions = [];
        highlighted = -1;
        break;
      }
    }
  };

  const handleAdd = () => {
    const row = asRow();
    rows = [...rows, row];

    // A new detail is Current, so it is added where it can be seen.
    tab = 'current';

    // Focusing has to wait for the row to exist in the DOM.
    requestAnimationFrame(() => keyInputs[row.rowId]?.focus());
  };

  const handleAddSubdetail = (row: Row) => {
    const sub = asField();
    row.subdetails = [...row.subdetails, sub];

    requestAnimationFrame(() => keyInputs[sub.rowId]?.focus());
  };

  const handleRemove = (rowId: string) => {
    const removed = rows.find((row) => row.rowId === rowId);
    for (const sub of removed?.subdetails ?? []) {
      delete keyInputs[sub.rowId];
    }

    rows = rows.filter((row) => row.rowId !== rowId);
    delete keyInputs[rowId];
  };

  const handleRemoveSubdetail = (row: Row, rowId: string) => {
    row.subdetails = row.subdetails.filter((sub) => sub.rowId !== rowId);
    delete keyInputs[rowId];
  };

  /**
   * Moves one row to where another is, by position in the whole list. Only Current rows are ever
   * moved, but Past rows are interleaved with them in `rows`, so the target is named as a row
   * rather than as a position on screen. Removing first and inserting at the target's old index
   * lands the row after a target below it and before a target above it, which is a swap for
   * neighbours whatever sits between them.
   */
  const moveTo = (fromRowId: string | undefined, toRowId: string | undefined) => {
    const from = rows.findIndex(({ rowId }) => rowId === fromRowId);
    const to = rows.findIndex(({ rowId }) => rowId === toRowId);
    if (from === -1 || to === -1 || from === to) {
      return false;
    }

    const reordered = [...rows];
    const [moved] = reordered.splice(from, 1);
    reordered.splice(to, 0, moved);
    rows = reordered;

    return true;
  };

  const handleDragStart = (event: DragEvent, row: Row) => {
    draggingRowId = row.rowId;

    // Firefox does not start a drag at all unless something is on the transfer.
    event.dataTransfer?.setData('text/plain', row.rowId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (event: DragEvent, row: Row) => {
    if (draggingRowId === undefined) {
      return;
    }

    // Without this the browser refuses the drop and animates the row back.
    event.preventDefault();

    moveTo(draggingRowId, row.rowId);
  };

  /** `index` is the row's place among the Current rows on screen, which is what the arrows move through. */
  const handleMoveKey = (event: KeyboardEvent, index: number) => {
    const to = event.key === 'ArrowUp' ? index - 1 : event.key === 'ArrowDown' ? index + 1 : undefined;
    if (to === undefined) {
      return;
    }

    // Keep the arrow keys from scrolling the modal out from under the row being moved.
    event.preventDefault();
    moveTo(currentRows[index]?.rowId, currentRows[to]?.rowId);
  };

  /** End: the fact stopped holding this month. Nothing replaces it, and it moves over to Past. */
  const handleEnd = (row: Row) => {
    row.until = thisMonth();
    row.untilPrecision = PersonDetailDatePrecision.Month;
  };

  /** Restore: the fact holds again after all, so it goes back to Current with no end date. */
  const handleRestore = (row: Row) => {
    row.until = null;
    row.untilPrecision = null;
  };

  /**
   * A saved Current row whose value now says something else, which is a new fact rather than a
   * correction often enough that keeping the old one is offered. Only the value counts: a changed
   * key on its own is a relabel. Putting the value back the way it was withdraws the offer.
   */
  const changesValue = (row: Row) =>
    !isBulk &&
    row.id !== undefined &&
    row.original !== undefined &&
    row.until === null &&
    row.value.trim() !== '' &&
    row.value.trim() !== row.original.value.trim();

  /**
   * An Until before the Since is refused by the server, so it is caught here instead, where the
   * row it is wrong on can be pointed at. Dates are compared as written, which is how the server
   * compares them once it has snapped both to the start of their month or year.
   */
  const isBackwards = (row: Pick<Row, 'since' | 'until'>) => !!row.since && !!row.until && row.until < row.since;

  const hasBackwards = $derived(!isBulk && rows.some((row) => isBackwards(row)));

  /** The keys typed so far, lowercased and deduplicated, which is what a conflict is asked about. */
  let typedKeys = $derived([
    ...new Set(rows.map((row) => row.key.trim().toLowerCase()).filter((key) => key.length > 0)),
  ]);

  // Asked again whenever the set of keys changes rather than on every keystroke, so finishing a key
  // is what triggers the lookup and editing a value never does.
  $effect(() => {
    if (!isBulk || typedKeys.length === 0) {
      conflicts = {};
      return;
    }

    const asked = typedKeys;
    clearTimeout(conflictDebounce);
    conflictDebounce = setTimeout(() => {
      void (async () => {
        try {
          const found = await getPersonDetailConflicts({
            personDetailConflictSearchDto: { personIds: people.map(({ id }) => id), keys: asked },
          });

          conflicts = Object.fromEntries(found.map((conflict) => [conflict.key, conflict.people]));
        } catch (error) {
          handleError(error, $t('errors.unable_to_load_detail_conflicts'));
        }
      })();
    }, SUGGESTION_DEBOUNCE);
  });

  /** Whether this person's existing value is to be overwritten rather than added alongside. */
  const isReplacing = (key: string, id: string) => (replacing[key.trim().toLowerCase()] ?? []).includes(id);

  const toggleReplacing = (key: string, id: string) => {
    const lowered = key.trim().toLowerCase();
    const chosen = replacing[lowered] ?? [];

    replacing = {
      ...replacing,
      [lowered]: chosen.includes(id) ? chosen.filter((other) => other !== id) : [...chosen, id],
    };
  };

  /** What is typed and what they hold being the same fact leaves nothing to decide. */
  const isSameValue = (person: PersonDetailConflictPersonResponseDto, value: string) =>
    person.value.trim().toLowerCase() === value.trim().toLowerCase();

  const asConflictTitle = (person: PersonDetailConflictPersonResponseDto, row: Row) => {
    const name = person.name || $t('person');
    const values = { current: person.value, value: row.value.trim() };

    if (isSameValue(person, row.value)) {
      return `${name}\n${$t('detail_conflict_already', { values })}`;
    }

    return `${name}\n${$t(isReplacing(row.key, person.id) ? 'detail_conflict_replace' : 'detail_conflict_append', { values })}`;
  };

  /**
   * A row blank at either end is an unfinished "+ Add detail", not something to refuse a save over,
   * so it is dropped rather than reported.
   */
  const asFields = ({ id, key, value, subdetails }: Row) => ({
    id,
    key: key.trim(),
    value: value.trim(),
    subdetails: subdetails
      .map((sub) => ({ id: sub.id, key: sub.key.trim(), value: sub.value.trim() }))
      .filter((sub) => sub.key && sub.value),
  });

  /**
   * The whole list, dates and all.
   *
   * A row whose value was changed with "Move the old one to Past" ticked goes out as two: a new
   * Current row where it stood, with the new value, no `id`, no dates and no subdetails; and the
   * old row under its own `id`, with the key and value it opened with, ended this month, keeping
   * every subdetail as it now reads, since those described the old fact rather than the new one.
   * The `id` going out on the old row is what tells the server it was archived, not deleted.
   */
  const asUpdatePayload = () =>
    rows
      .flatMap((row) => {
        const fields = asFields(row);
        const dates = {
          kind: row.kind,
          latitude: row.latitude,
          longitude: row.longitude,
          since: row.since,
          sincePrecision: row.sincePrecision,
          until: row.until,
          untilPrecision: row.untilPrecision,
        };

        if (!changesValue(row) || !row.archive || !row.original) {
          return [{ ...fields, ...dates }];
        }

        return [
          {
            ...fields,
            id: undefined,
            subdetails: [],
            // Only free-text rows are ever edited here, but the kind is kept all the same; a pin
            // marked the old place, so it stays on the old row.
            kind: row.kind,
            latitude: null,
            longitude: null,
            since: null,
            sincePrecision: null,
            until: null,
            untilPrecision: null,
          },
          {
            ...fields,
            ...dates,
            key: row.original.key,
            value: row.original.value,
            until: thisMonth(),
            untilPrecision: PersonDetailDatePrecision.Month,
          },
        ];
      })
      .filter(({ key, value }) => key && value);

  /** The people a bulk row overwrites rather than adds to, which only ever come from the conflicts shown. */
  const asReplaced = (row: Pick<Row, 'key' | 'value'>) =>
    (conflicts[row.key.trim().toLowerCase()] ?? [])
      .filter((person) => !isSameValue(person, row.value) && isReplacing(row.key, person.id))
      .map(({ id }) => id);

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    isSaving = true;

    try {
      if (isBulk) {
        await addPersonDetails({
          personDetailsBulkAddDto: {
            personIds: people.map(({ id }) => id),
            // Bulk items carry no dates: what is added is Current, and the server ends whatever it
            // replaces. Only ever people shown as already holding the key, since that is the only
            // place the choice can be made, and only where there is something different to overwrite.
            details: rows
              .map((row) => {
                const replaceForPersonIds = asReplaced(row);

                return {
                  ...asFields(row),
                  replaceForPersonIds,
                  ...(replaceForPersonIds.length > 0 && { archiveReplaced: row.archive }),
                };
              })
              .filter(({ key, value }) => key && value),
          },
        });

        // A list back is how the caller tells an apply from a cancel. It is empty because the
        // details now belong to other people, and none of them is the one this modal was opened on.
        onClose([]);
        return;
      }

      const saved = await updatePersonDetails({
        id: personId!,
        personDetailsUpdateDto: { details: asUpdatePayload() },
      });

      onClose(saved);
    } catch (error) {
      handleError(error, $t(isBulk ? 'errors.unable_to_add_details' : 'errors.unable_to_save_details'));
    } finally {
      isSaving = false;
    }
  };
</script>

<Modal
  size="medium"
  title={isBulk ? $t('add_details_to_people', { values: { count: people.length } }) : $t('edit_details')}
  icon={mdiTagOutline}
  {onClose}
>
  <ModalBody>
    <form {onsubmit} autocomplete="off" id="person-details-form">
      <!-- Only once there is history to switch to, styled as the toggle in the person's header. -->
      {#if !isBulk && pastRows.length > 0}
        <div role="tablist" aria-label={$t('person_details')} class="mt-2 flex gap-1 text-xs">
          {#each tabs as option (option.id)}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === option.id}
              class="rounded-full px-2.5 py-0.5 {activeTab === option.id
                ? 'bg-subtle text-primary'
                : 'text-gray-500 dark:text-gray-400 hover:text-primary'}"
              onclick={() => (tab = option.id)}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/if}

      <div class="my-2 flex flex-col gap-2">
        {#if shownRows.length === 0}
          <Text size="small" color="muted">{$t(pastRows.length > 0 ? 'details_none_current' : 'no_details_yet')}</Text>
        {/if}

        {#each shownRows as row, index (row.rowId)}
          {@const isPast = row.until !== null}
          <div
            class="flex flex-col gap-1 rounded-2xl p-1 {draggingRowId === row.rowId ? 'opacity-50' : ''}"
            ondragover={(event) => handleDragOver(event, row)}
            role="listitem"
          >
            <div class="flex place-items-start gap-2">
              <!-- Past rows are ordered by when they ended, so there is nothing to drag. The space
                   is kept, so keys line up across both tabs and with the subdetails below. -->
              {#if isPast}
                <span class="mt-2 size-7 shrink-0"></span>
              {:else}
                <button
                  type="button"
                  class="mt-2 flex size-7 shrink-0 cursor-grab place-items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:text-primary active:cursor-grabbing"
                  draggable="true"
                  aria-label={$t('detail_reorder')}
                  ondragstart={(event) => handleDragStart(event, row)}
                  ondragend={() => (draggingRowId = undefined)}
                  onkeydown={(event) => handleMoveKey(event, index)}
                >
                  <Icon icon={mdiDragHorizontalVariant} size="1.25em" aria-hidden />
                </button>
              {/if}

              <button
                type="button"
                class="mt-2 flex size-7 shrink-0 place-items-center justify-center rounded-full text-gray-500 dark:text-gray-400 hover:text-primary"
                aria-label={$t('add_subdetail')}
                onclick={() => handleAddSubdetail(row)}
              >
                <Icon icon={mdiSubdirectoryArrowRight} size="1.25em" aria-hidden />
              </button>

              <div class="w-40 shrink-0">
                <Input
                  inputSize={1}
                  bind:ref={keyInputs[row.rowId]}
                  bind:value={row.key}
                  aria-label={$t('detail_key')}
                  placeholder={$t('detail_key')}
                  onfocus={(event) => handleFocus(event, row.rowId, 'key')}
                  oninput={() => handleInput(row.rowId, 'key')}
                  onkeydown={handleFieldKeydown}
                  onblur={() => handleKeyBlur(row.rowId)}
                />
              </div>

              <div class="grow">
                <Input
                  inputSize={1}
                  bind:value={row.value}
                  aria-label={$t('detail_value')}
                  placeholder={$t('detail_value')}
                  onfocus={(event) => handleFocus(event, row.rowId, 'value')}
                  oninput={() => handleInput(row.rowId, 'value')}
                  onkeydown={handleFieldKeydown}
                  onblur={handleBlur}
                />
              </div>

              <button
                type="button"
                class="mt-2 shrink-0 rounded-full p-1 text-gray-500 dark:text-gray-400 hover:text-danger"
                aria-label={$t('delete_detail')}
                onclick={() => handleRemove(row.rowId)}
              >
                <Icon icon={mdiClose} size="1.25em" aria-hidden />
              </button>
            </div>

            <!-- When the fact held, and the way in or out of Past. Bulk rows have none of it: what
                 is added to several people is Current and undated. -->
            {#if !isBulk}
              <div class="flex flex-wrap place-items-center gap-x-3 gap-y-1 ps-[4.5rem]">
                <DetailDateInput
                  label={$t('detail_since_label')}
                  bind:date={row.since}
                  bind:precision={row.sincePrecision}
                  invalid={isBackwards(row)}
                />

                {#if isPast}
                  <DetailDateInput
                    label={$t('detail_until_label')}
                    bind:date={row.until}
                    bind:precision={row.untilPrecision}
                    clearable={false}
                    invalid={isBackwards(row)}
                  />
                {/if}

                <button
                  type="button"
                  class="rounded-full px-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary"
                  onclick={() => (isPast ? handleRestore(row) : handleEnd(row))}
                >
                  {$t(isPast ? 'restore' : 'detail_end')}
                </button>

                {#if changesValue(row)}
                  <span class="flex place-items-center gap-1">
                    <Checkbox id="archive-{row.rowId}" size="tiny" bind:checked={row.archive} />
                    <Label class="text-xs" label={$t('detail_archive_old')} for="archive-{row.rowId}" />
                  </span>
                {/if}

                {#if isBackwards(row)}
                  <span class="w-full text-xs text-danger" role="alert">{$t('detail_until_before_since')}</span>
                {/if}
              </div>
            {/if}

            <!-- Indented by exactly the two fixed-size buttons above and the gaps around them, so a
                 subdetail key starts where the detail key it hangs from starts. -->
            {#each row.subdetails as sub (sub.rowId)}
              <div class="flex place-items-start gap-2 ps-[4.5rem]">
                <div class="w-40 shrink-0">
                  <Input
                    inputSize={1}
                    bind:ref={keyInputs[sub.rowId]}
                    bind:value={sub.key}
                    size="tiny"
                    aria-label={$t('detail_subdetail_key')}
                    placeholder={$t('detail_subdetail_key')}
                    onfocus={(event) => handleFocus(event, sub.rowId, 'key')}
                    oninput={() => handleInput(sub.rowId, 'key')}
                    onkeydown={handleFieldKeydown}
                    onblur={() => handleKeyBlur(sub.rowId)}
                  />
                </div>

                <div class="grow">
                  <Input
                    inputSize={1}
                    bind:value={sub.value}
                    size="tiny"
                    aria-label={$t('detail_value')}
                    placeholder={$t('detail_value')}
                    onfocus={(event) => handleFocus(event, sub.rowId, 'value')}
                    oninput={() => handleInput(sub.rowId, 'value')}
                    onkeydown={handleFieldKeydown}
                    onblur={handleBlur}
                  />
                </div>

                <button
                  type="button"
                  class="mt-1 shrink-0 rounded-full p-1 text-gray-500 dark:text-gray-400 hover:text-danger"
                  aria-label={$t('delete_subdetail')}
                  onclick={() => handleRemoveSubdetail(row, sub.rowId)}
                >
                  <Icon icon={mdiClose} size="1.25em" aria-hidden />
                </button>
              </div>
            {/each}

            <!-- Everyone here already records this key. Green and a plus is what happens if nothing
                 is touched: they keep what they have and gain this as well. Clicking a face turns it
                 yellow, and that person's existing value is overwritten instead. Anyone already
                 recording this exact value is shown greyed and cannot be toggled, since there is
                 nothing to append and nothing to replace. -->
            {#if isBulk && row.value.trim() && (conflicts[row.key.trim().toLowerCase()] ?? []).length > 0}
              <div class="flex flex-wrap place-items-center gap-2 ps-[4.5rem] pt-1">
                <span class="text-xs text-gray-500 dark:text-gray-400">{$t('detail_conflicts')}</span>

                {#each conflicts[row.key.trim().toLowerCase()] as person (person.id)}
                  {@const same = isSameValue(person, row.value)}
                  {@const replace = !same && isReplacing(row.key, person.id)}
                  <button
                    type="button"
                    class="relative rounded-full"
                    disabled={same}
                    title={asConflictTitle(person, row)}
                    aria-label={asConflictTitle(person, row)}
                    aria-pressed={same ? undefined : replace}
                    onclick={() => toggleReplacing(row.key, person.id)}
                  >
                    <ImageThumbnail
                      circle
                      url={getPeopleThumbnailUrl(person)}
                      altText={person.name}
                      widthStyle="1.75rem"
                      heightStyle="1.75rem"
                      class="ring-2 {same ? 'ring-gray-400' : replace ? 'ring-yellow-500' : 'ring-green-500'}"
                    />
                    <span
                      class="absolute -bottom-0.5 -end-0.5 rounded-full p-px text-white {same
                        ? 'bg-gray-400'
                        : replace
                          ? 'bg-yellow-500'
                          : 'bg-green-500'}"
                    >
                      <Icon icon={same ? mdiCheck : replace ? mdiRefresh : mdiPlus} size="0.75em" aria-hidden />
                    </span>
                  </button>
                {/each}

                <!-- Only once someone is being overwritten, since appending leaves nothing behind
                     to keep. Applies to everyone this row replaces. -->
                {#if asReplaced(row).length > 0}
                  <span class="flex place-items-center gap-1">
                    <Checkbox id="archive-{row.rowId}" size="tiny" bind:checked={row.archive} />
                    <Label class="text-xs" label={$t('detail_archive_old_bulk')} for="archive-{row.rowId}" />
                  </span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}

        <div>
          <Button shape="round" variant="ghost" size="small" leadingIcon={mdiPlus} onclick={handleAdd}>
            {$t('add_detail')}
          </Button>
        </div>
      </div>
    </form>

    {#if activeField && anchor && suggestions.length > 0}
      <ul
        class="fixed z-10 max-h-48 overflow-y-auto rounded-2xl border border-gray-200 dark:border-immich-dark-gray bg-light shadow-lg"
        style="top: {anchor.top}px; left: {anchor.left}px; width: {anchor.width}px"
        aria-label={$t('detail_suggestions')}
      >
        {#each suggestions as suggestion, index (suggestion.value)}
          <li>
            <!-- mousedown, not click: blur would tear the list down before a click landed. -->
            <button
              type="button"
              class="flex w-full place-items-center justify-between gap-2 px-3 py-1 text-start text-sm hover:bg-subtle {index ===
              highlighted
                ? 'bg-subtle'
                : ''}"
              onmousedown={() => applySuggestion(suggestion.value)}
            >
              <span class="truncate text-primary">{suggestion.value}</span>
              <span class="shrink-0 text-xs text-gray-500 dark:text-gray-400">{suggestion.count}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </ModalBody>

  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={() => onClose()}>{$t('cancel')}</Button>
      <Button shape="round" type="submit" fullWidth form="person-details-form" disabled={isSaving || hasBackwards}>
        {$t(isBulk ? 'apply' : 'save')}
      </Button>
    </HStack>
  </ModalFooter>
</Modal>
