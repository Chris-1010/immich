<script lang="ts">
  import Combobox from '$lib/components/shared-components/combobox.svelte';
  import DateInput from '$lib/elements/DateInput.svelte';
  import type { TimelineAsset } from '$lib/managers/timeline-manager/types';
  import { getPreferredTimeZone, getTimezones, toIsoDate, type ZoneOption } from '$lib/modals/timezone-utils';
  import { getAssetDateTime, pickAsset, toPickerDate } from '$lib/utils/asset-picker';
  import { handleError } from '$lib/utils/handle-error';
  import { updateAsset } from '@immich/sdk';
  import { Button, HStack, Label, Modal, ModalBody, ModalFooter } from '@immich/ui';
  import { mdiCalendarEdit, mdiImageSearchOutline } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';

  interface Props {
    initialDate?: DateTime;
    initialTimeZone?: string;
    timezoneInput?: boolean;
    asset: TimelineAsset;
    onClose: (success: boolean) => void;
  }

  let { initialDate = DateTime.now(), initialTimeZone, timezoneInput = true, asset, onClose }: Props = $props();

  let selectedDate = $state(initialDate.toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS"));
  const timezones = $derived(getTimezones(selectedDate));

  // svelte-ignore state_referenced_locally
  let lastSelectedTimezone = $state(getPreferredTimeZone(initialDate, initialTimeZone, timezones));
  // the offsets (and validity) for time zones may change if the date is changed, which is why we recompute the list
  let selectedOption = $derived(getPreferredTimeZone(initialDate, initialTimeZone, timezones, lastSelectedTimezone));

  const handleClose = async () => {
    if (!date.isValid || !selectedOption) {
      onClose(false);
      return;
    }

    // Get the local date/time components from the selected string using neutral timezone
    const isoDate = toIsoDate(selectedDate, selectedOption);
    try {
      await updateAsset({ id: asset.id, updateAssetDto: { dateTimeOriginal: isoDate } });
      onClose(true);
    } catch (error) {
      handleError(error, $t('errors.unable_to_change_date'));
      onClose(false);
    }
  };

  // Copies the date, time and time zone of a photo the user picks, read the same way the details
  // panel shows them. The picker opens at the date currently entered.
  const handleFromImage = async () => {
    const picked = await pickAsset({ initialDate: toPickerDate(selectedDate) });
    if (!picked) {
      return;
    }
    try {
      const { date: pickedDate, timeZone } = await getAssetDateTime(picked.id);
      selectedDate = pickedDate.toFormat("yyyy-MM-dd'T'HH:mm:ss.SSS");
      lastSelectedTimezone = getPreferredTimeZone(pickedDate, timeZone, getTimezones(selectedDate));
    } catch (error) {
      handleError(error, $t('errors.unable_to_read_photo'));
    }
  };

  // when changing the time zone, assume the configured date/time is meant for that time zone (instead of updating it)
  const date = $derived(DateTime.fromISO(selectedDate, { zone: selectedOption?.value, setZone: true }));
</script>

<Modal title={$t('edit_date_and_time')} icon={mdiCalendarEdit} onClose={() => onClose(false)} size="small">
  <ModalBody>
    <Label for="datetime" class="block mb-1">{$t('date_and_time')}</Label>
    <DateInput
      class="immich-form-input text-gray-700 w-full mb-2"
      id="datetime"
      type="datetime-local"
      bind:value={selectedDate}
    />
    <div class="mb-2 flex justify-end">
      <Button size="small" variant="ghost" leadingIcon={mdiImageSearchOutline} onclick={handleFromImage}>
        {$t('from_image')}
      </Button>
    </div>
    {#if timezoneInput}
      <div class="w-full">
        <Combobox
          bind:selectedOption
          label={$t('timezone')}
          options={timezones}
          placeholder={$t('search_timezone')}
          onSelect={(option) => (lastSelectedTimezone = option as ZoneOption)}
        />
      </div>
    {/if}
  </ModalBody>
  <ModalFooter>
    <HStack fullWidth>
      <Button shape="round" color="secondary" fullWidth onclick={() => onClose(false)}>{$t('cancel')}</Button>
      <Button shape="round" type="submit" fullWidth onclick={handleClose}>{$t('confirm')}</Button>
    </HStack>
  </ModalFooter>
</Modal>
