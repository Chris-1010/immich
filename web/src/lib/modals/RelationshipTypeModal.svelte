<script lang="ts">
  import { handleError } from '$lib/utils/handle-error';
  import {
    createRelationshipType,
    deleteRelationshipType,
    getRelationshipTypeUsage,
    updateRelationshipType,
    type RelationshipTypeResponseDto,
  } from '@immich/sdk';
  import {
    Button,
    Field,
    HStack,
    Input,
    Label,
    Modal,
    ModalBody,
    ModalFooter,
    modalManager,
    Text,
    toastManager,
  } from '@immich/ui';
  import { mdiAccountMultipleOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';

  interface Props {
    type?: RelationshipTypeResponseDto;
    onClose: (
      result?: { action: 'saved'; type: RelationshipTypeResponseDto } | { action: 'deleted'; id: string },
    ) => void;
  }

  let { type, onClose }: Props = $props();

  /** Matches the bound the server accepts, so a typo is reported here rather than as a failed save. */
  const MAX_AGE_GAP = 150;

  // Symmetry is fixed when a type is created: the server refuses to rename a symmetric type into
  // an asymmetric one, or the reverse. Editing therefore only ever offers the names.
  const isEditingSymmetric = type ? type.id === type.inverseId : false;

  let name = $state(type?.name ?? '');
  let inverseName = $state(type && !isEditingSymmetric ? type.inverseName : '');

  // A symmetric type is read from both ends at once, so its range can only be "within so many
  // years either way" — one number rather than a lowest and a highest.
  let isSymmetric = $derived(type ? isEditingSymmetric : !inverseName.trim());

  const asField = (value: number | null | undefined) => (value === null || value === undefined ? '' : String(value));

  let ageSpread = $state(asField(type?.maxAgeGap));
  let minAgeGap = $state(asField(type?.minAgeGap));
  let maxAgeGap = $state(asField(type?.maxAgeGap));

  /**
   * The range as entered, in signed years: how much older the person the type describes usually
   * is. Undefined when it does not parse, which is reported rather than saved.
   */
  const readAgeGap = (): { minAgeGap: number | null; maxAgeGap: number | null } | undefined => {
    const fields = isSymmetric ? [ageSpread, ageSpread] : [minAgeGap, maxAgeGap];
    const [lowest, highest] = fields.map((field) => field.trim());

    if (!lowest && !highest) {
      return { minAgeGap: null, maxAgeGap: null };
    }

    if (!lowest || !highest) {
      return;
    }

    const parsed = [lowest, highest].map(Number);
    if (parsed.some((value) => !Number.isInteger(value) || Math.abs(value) > MAX_AGE_GAP)) {
      return;
    }

    const [min, max] = isSymmetric ? [-Math.abs(parsed[1]), Math.abs(parsed[1])] : parsed;

    return min > max ? undefined : { minAgeGap: min, maxAgeGap: max };
  };

  const onsubmit = async () => {
    const trimmedName = name.trim();
    const trimmedInverseName = inverseName.trim();

    if (!trimmedName) {
      toastManager.warning($t('relationship_type_name_required'));
      return;
    }

    if (type && !isEditingSymmetric && !trimmedInverseName) {
      toastManager.warning($t('relationship_type_opposite_required'));
      return;
    }

    const ageGap = readAgeGap();
    if (!ageGap) {
      toastManager.warning($t('relationship_type_age_gap_invalid'));
      return;
    }

    try {
      let saved: RelationshipTypeResponseDto;
      if (type) {
        saved = await updateRelationshipType({
          id: type.id,
          relationshipTypeUpdateDto: isEditingSymmetric
            ? { name: trimmedName, ...ageGap }
            : { name: trimmedName, inverseName: trimmedInverseName, ...ageGap },
        });
        toastManager.success($t('relationship_type_updated', { values: { name: saved.name } }));
      } else {
        saved = await createRelationshipType({
          relationshipTypeCreateDto: {
            name: trimmedName,
            inverseName: trimmedInverseName || undefined,
            ...ageGap,
          },
        });
        toastManager.success($t('relationship_type_created', { values: { name: saved.name } }));
      }

      onClose({ action: 'saved', type: saved });
    } catch (error) {
      handleError(error, $t('errors.unable_to_save_relationship_type'));
    }
  };

  const handleDelete = async () => {
    if (!type) {
      return;
    }

    try {
      // The counts come from a read first, so the confirmation states what will go before it goes.
      const usage = await getRelationshipTypeUsage({ id: type.id });
      const values = {
        name: type.name,
        inverseName: type.inverseName,
        relationshipCount: usage.relationshipCount,
        personCount: usage.personCount,
      };

      const confirmed = await modalManager.showDialog({
        title: $t('relationship_type_delete'),
        prompt: isEditingSymmetric
          ? $t('relationship_type_delete_confirmation_symmetric', { values })
          : $t('relationship_type_delete_confirmation', { values }),
        confirmText: $t('delete'),
      });

      if (!confirmed) {
        return;
      }

      await deleteRelationshipType({ id: type.id });
      toastManager.success($t('relationship_type_deleted', { values: { name: type.name } }));

      onClose({ action: 'deleted', id: type.id });
    } catch (error) {
      handleError(error, $t('errors.unable_to_delete_relationship_type'));
    }
  };
</script>

<Modal
  size="small"
  title={type ? $t('relationship_type_edit') : $t('relationship_type_new')}
  icon={mdiAccountMultipleOutline}
  {onClose}
>
  <ModalBody>
    <form {onsubmit} autocomplete="off" id="relationship-type-form">
      <div class="my-4 flex flex-col gap-4">
        <Field label={$t('name')} description={$t('relationship_type_name_description')} required>
          <Input bind:value={name} />
        </Field>

        {#if isEditingSymmetric}
          <Text size="small" color="muted">{$t('relationship_type_symmetric_description')}</Text>
        {:else}
          <Field
            label={$t('relationship_type_opposite')}
            description={type
              ? $t('relationship_type_opposite_description')
              : $t('relationship_type_opposite_description_optional')}
            required={!!type}
          >
            <Input bind:value={inverseName} />
          </Field>
        {/if}

        {#if isSymmetric}
          <Field
            label={$t('relationship_type_age_spread')}
            description={$t('relationship_type_age_spread_description')}
          >
            <Input inputmode="numeric" bind:value={ageSpread} />
          </Field>
        {:else}
          <!-- Two inputs share one label, so the label and description are written out here rather
               than left to Field, which would repeat both once per input. -->
          <div class="flex w-full flex-col gap-1">
            <Label label={$t('relationship_type_age_gap')} />
            <Text color="muted" size="small" class="mb-2">{$t('relationship_type_age_gap_description')}</Text>
            <div class="flex items-center gap-2">
              <div class="w-24">
                <Input inputmode="numeric" bind:value={minAgeGap} aria-label={$t('relationship_type_age_gap_lowest')} />
              </div>
              <Text aria-hidden="true">–</Text>
              <div class="w-24">
                <Input
                  inputmode="numeric"
                  bind:value={maxAgeGap}
                  aria-label={$t('relationship_type_age_gap_highest')}
                />
              </div>
            </div>
          </div>
        {/if}
      </div>
    </form>
  </ModalBody>

  <ModalFooter>
    <HStack fullWidth>
      {#if type}
        <Button shape="round" color="danger" variant="ghost" fullWidth onclick={handleDelete}>{$t('delete')}</Button>
      {/if}
      <Button shape="round" color="secondary" fullWidth onclick={() => onClose()}>{$t('cancel')}</Button>
      <Button shape="round" type="submit" fullWidth form="relationship-type-form">
        {type ? $t('save') : $t('create')}
      </Button>
    </HStack>
  </ModalFooter>
</Modal>
