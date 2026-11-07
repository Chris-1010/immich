<script lang="ts">
  import DetailDateInput from '$lib/components/faces-page/detail-date-input.svelte';
  import { handleError } from '$lib/utils/handle-error';
  import {
    asContactFieldPayload,
    canPin,
    changesValue,
    contactFieldLabel,
    currentOfKind,
    thisMonth,
    type ContactFieldPin,
    type ContactFieldRow,
  } from '$lib/utils/contact-fields';
  import {
    PersonDetailDatePrecision,
    PersonDetailKind,
    getPersonDetailValues,
    updatePersonDetails,
    type PersonDetailResponseDto,
    type PersonDetailSuggestionResponseDto,
  } from '@immich/sdk';
  import { Button, Checkbox, HStack, Icon, Input, Label, Modal, ModalBody, ModalFooter, Text } from '@immich/ui';
  import { mdiBriefcase, mdiClose, mdiEmail, mdiHome, mdiMapMarker, mdiPhone, mdiPlus } from '@mdi/js';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    personId: string;
    /** The one kind being edited. Every other detail goes back untouched. */
    kind: PersonDetailKind;
    /** The person's whole list, which the save rewrites. */
    details: PersonDetailResponseDto[];
    /**
     * Picks a pin for a Home or Work row. Without it there is no "Set pin" button at all. Resolves
     * to nothing when the picker is cancelled. The row is passed so the picker can start from the
     * pin the row already has.
     */
    onSetPin?: (row: ContactFieldRow) => Promise<ContactFieldPin | undefined>;
    onClose: (result?: PersonDetailResponseDto[]) => void;
  }

  let { personId, kind, details, onSetPin, onClose }: Props = $props();

  /** Long enough that typing a word does not fire a request per letter, short enough to feel live. */
  const SUGGESTION_DEBOUNCE = 200;

  const icons: Record<PersonDetailKind, string> = {
    [PersonDetailKind.Work]: mdiBriefcase,
    [PersonDetailKind.Home]: mdiHome,
    [PersonDetailKind.Email]: mdiEmail,
    [PersonDetailKind.Phone]: mdiPhone,
  };

  /** What the on-screen keyboard should offer for the value: an @ for email, digits for a phone. */
  const inputMode = $derived(
    kind === PersonDetailKind.Email ? 'email' : kind === PersonDetailKind.Phone ? 'tel' : undefined,
  );

  const label = $derived($t(contactFieldLabel[kind]));

  let nextRowId = 0;
  const asRow = (detail?: PersonDetailResponseDto): ContactFieldRow => ({
    rowId: `contact-${nextRowId++}`,
    source: detail,
    value: detail?.value ?? '',
    since: detail?.since ?? null,
    sincePrecision: detail?.sincePrecision ?? null,
    until: null,
    untilPrecision: null,
    latitude: detail?.latitude ?? null,
    longitude: detail?.longitude ?? null,
    archive: true,
  });

  // Nothing of this kind yet means the editor was opened to add one, so it opens on a blank row
  // with the caret in it rather than on a bare "Add another".
  const initial = currentOfKind(details, kind);
  const initialRows = initial.length > 0 ? initial.map((detail) => asRow(detail)) : [asRow()];
  let rows = $state<ContactFieldRow[]>(initialRows);

  /**
   * Seeded with null per row: `bind:ref` refuses to bind an absent entry, as in the details modal.
   */
  let valueInputs = $state<Record<string, HTMLInputElement | null>>(
    Object.fromEntries(initialRows.map(({ rowId }) => [rowId, null])),
  );

  let suggestions = $state<PersonDetailSuggestionResponseDto[]>([]);
  let isSaving = $state(false);
  let debounce: ReturnType<typeof setTimeout> | undefined;

  onMount(() => {
    if (initial.length === 0) {
      valueInputs[rows[0].rowId]?.focus();
    }
  });

  /**
   * What this kind already holds anywhere in the library, so a workplace is typed the way everyone
   * else's is and the along-with group finds them. Looked up by kind, never by key text.
   */
  const loadSuggestions = (term: string) => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      void (async () => {
        try {
          suggestions = await getPersonDetailValues({ kind, term });
        } catch {
          // A convenience only: the value saves just the same without it.
          suggestions = [];
        }
      })();
    }, SUGGESTION_DEBOUNCE);
  };

  const handleAdd = () => {
    const row = asRow();
    valueInputs[row.rowId] = null;
    rows = [...rows, row];

    requestAnimationFrame(() => valueInputs[row.rowId]?.focus());
  };

  /** Only a row that was never saved can be taken back out. A saved one is ended instead. */
  const handleRemove = (rowId: string) => {
    rows = rows.filter((row) => row.rowId !== rowId);
    delete valueInputs[rowId];
  };

  /** End: the value stopped holding this month, with nothing in its place. Saved on Save. */
  const handleEnd = (row: ContactFieldRow) => {
    row.until = thisMonth();
    row.untilPrecision = PersonDetailDatePrecision.Month;
  };

  /** Undoes an End made in this sitting, before it was saved. */
  const handleRestore = (row: ContactFieldRow) => {
    row.until = null;
    row.untilPrecision = null;
  };

  /**
   * The seam for pins. The picker is the caller's, so this only applies what it hands back: the
   * coordinates, and its name as the value when the value is still blank — a pin dropped for a home
   * with no name yet is still better named after where it was dropped than left empty. Its address
   * is kept too, for a value cleared again before Save.
   */
  const handleSetPin = async (row: ContactFieldRow) => {
    const pin = await onSetPin?.(row);
    if (!pin) {
      return;
    }

    row.latitude = pin.latitude;
    row.longitude = pin.longitude;
    row.pinAddress = pin.address;
    if (!row.value.trim() && pin.name) {
      row.value = pin.name;
    }
  };

  const handleRemovePin = (row: ContactFieldRow) => {
    row.latitude = null;
    row.longitude = null;
    row.pinAddress = undefined;
  };

  /** Caught here rather than by the server, so the row it is wrong on can be pointed at. */
  const isBackwards = (row: ContactFieldRow) => !!row.since && !!row.until && row.until < row.since;
  const hasBackwards = $derived(rows.some((row) => isBackwards(row)));

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    isSaving = true;

    try {
      const saved = await updatePersonDetails({
        id: personId,
        personDetailsUpdateDto: { details: asContactFieldPayload(details, kind, rows, label) },
      });

      onClose(saved);
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_details'));
    } finally {
      isSaving = false;
    }
  };
</script>

<Modal size="small" title={label} icon={icons[kind]} {onClose}>
  <ModalBody>
    <form {onsubmit} autocomplete="off" id="contact-field-form">
      <div class="my-2 flex flex-col gap-3">
        {#each rows as row (row.rowId)}
          {@const ended = row.until !== null}
          <div class="flex flex-col gap-1" role="listitem">
            <div class="flex place-items-start gap-2">
              <div class="grow {ended ? 'opacity-50' : ''}">
                <Input
                  inputSize={1}
                  bind:ref={valueInputs[row.rowId]}
                  bind:value={row.value}
                  inputmode={inputMode}
                  list="contact-field-suggestions"
                  disabled={ended}
                  aria-label={label}
                  placeholder={label}
                  onfocus={() => loadSuggestions(row.value)}
                  oninput={() => loadSuggestions(row.value)}
                />
              </div>

              {#if !row.source}
                <button
                  type="button"
                  class="mt-2 shrink-0 rounded-full p-1 text-gray-500 dark:text-gray-400 hover:text-danger"
                  aria-label={$t('delete_detail')}
                  onclick={() => handleRemove(row.rowId)}
                >
                  <Icon icon={mdiClose} size="1.25em" aria-hidden />
                </button>
              {/if}
            </div>

            <div class="flex flex-wrap place-items-center gap-x-3 gap-y-1">
              {#if ended}
                <Text size="tiny" color="muted">{$t('contact_field_ended')}</Text>
              {:else}
                <DetailDateInput
                  label={$t('detail_since_label')}
                  bind:date={row.since}
                  bind:precision={row.sincePrecision}
                  invalid={isBackwards(row)}
                />
              {/if}

              <!-- Only on a saved row: a value never saved has nothing to end, and is removed instead. -->
              {#if row.source}
                <button
                  type="button"
                  class="rounded-full px-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary"
                  onclick={() => (ended ? handleRestore(row) : handleEnd(row))}
                >
                  {$t(ended ? 'restore' : 'detail_end')}
                </button>
              {/if}

              <!-- Only for the kinds a pin means anything on; the server refuses coordinates elsewhere. -->
              {#if onSetPin && canPin(kind) && !ended}
                {@const pinned = row.latitude !== null && row.longitude !== null}
                <span class="flex place-items-center">
                  <button
                    type="button"
                    class="flex place-items-center gap-1 rounded-full px-1 text-xs hover:text-primary {pinned
                      ? 'text-primary'
                      : 'text-gray-500 dark:text-gray-400'}"
                    onclick={() => handleSetPin(row)}
                  >
                    <Icon icon={mdiMapMarker} size="1em" aria-hidden />
                    {$t(pinned ? 'contact_field_move_pin' : 'contact_field_set_pin')}
                  </button>
                  {#if pinned}
                    <!-- Clears the coordinates only; the value was the user's to type and stays. -->
                    <button
                      type="button"
                      class="rounded-full text-gray-500 dark:text-gray-400 hover:text-danger"
                      aria-label={$t('contact_field_remove_pin')}
                      title={$t('contact_field_remove_pin')}
                      onclick={() => handleRemovePin(row)}
                    >
                      <Icon icon={mdiClose} size="1em" aria-hidden />
                    </button>
                  {/if}
                </span>
              {/if}

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
          </div>
        {/each}

        <div>
          <Button shape="round" variant="ghost" size="small" leadingIcon={mdiPlus} onclick={handleAdd}>
            {$t('contact_field_add_another')}
          </Button>
        </div>
      </div>

      <!-- Native, so the list follows the caret and the keyboard without any positioning of its own. -->
      <datalist id="contact-field-suggestions">
        {#each suggestions as suggestion (suggestion.value)}
          <option value={suggestion.value}></option>
        {/each}
      </datalist>
    </form>
  </ModalBody>

  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={() => onClose()}>{$t('cancel')}</Button>
      <Button shape="round" type="submit" fullWidth form="contact-field-form" disabled={isSaving || hasBackwards}>
        {$t('save')}
      </Button>
    </HStack>
  </ModalFooter>
</Modal>
