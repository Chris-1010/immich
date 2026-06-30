<script lang="ts">
  import ChangeLocation, { type ChangeLocationResult } from '$lib/components/shared-components/change-location.svelte';
  import { getAssetControlContext } from '$lib/components/timeline/AssetSelectControlBar.svelte';
  import { user } from '$lib/stores/user.store';
  import { getOwnedAssetsWithWarning } from '$lib/utils/asset-utils';
  import { handleError } from '$lib/utils/handle-error';
  import { updateAssets, type AssetBulkUpdateDto } from '@immich/sdk';
  import { mdiMapMarkerMultipleOutline } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import MenuOption from '../../shared-components/context-menu/menu-option.svelte';

  interface Props {
    menuItem?: boolean;
  }

  let { menuItem = false }: Props = $props();
  const { clearSelect, getOwnedAssets } = getAssetControlContext();

  let isShowChangeLocation = $state(false);

  async function handleConfirm(result?: ChangeLocationResult) {
    isShowChangeLocation = false;

    if (!result) {
      return;
    }

    const ids = getOwnedAssetsWithWarning(getOwnedAssets(), $user);
    const assetBulkUpdateDto: AssetBulkUpdateDto =
      result.type === 'coordinates'
        ? { ids, latitude: result.point.lat, longitude: result.point.lng }
        : { ids, noLocation: result.value };

    try {
      await updateAssets({ assetBulkUpdateDto });
      clearSelect();
    } catch (error) {
      handleError(error, $t('errors.unable_to_update_location'));
    }
  }
</script>

{#if menuItem}
  <MenuOption
    text={$t('change_location')}
    icon={mdiMapMarkerMultipleOutline}
    onClick={() => (isShowChangeLocation = true)}
  />
{/if}
{#if isShowChangeLocation}
  <ChangeLocation onClose={handleConfirm} />
{/if}
