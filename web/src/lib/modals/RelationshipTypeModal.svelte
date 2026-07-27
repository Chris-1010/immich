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

  // Symmetry is fixed when a type is created: the server refuses to rename a symmetric type into
  // an asymmetric one, or the reverse. Editing therefore only ever offers the names.
  const isEditingSymmetric = type ? type.id === type.inverseId : false;

  let name = $state(type?.name ?? '');
  let inverseName = $state(type && !isEditingSymmetric ? type.inverseName : '');

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

    try {
      let saved: RelationshipTypeResponseDto;
      if (type) {
        saved = await updateRelationshipType({
          id: type.id,
          relationshipTypeUpdateDto: isEditingSymmetric
            ? { name: trimmedName }
            : { name: trimmedName, inverseName: trimmedInverseName },
        });
        toastManager.success($t('relationship_type_updated', { values: { name: saved.name } }));
      } else {
        saved = await createRelationshipType({
          relationshipTypeCreateDto: { name: trimmedName, inverseName: trimmedInverseName || undefined },
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
