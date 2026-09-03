<script lang="ts">
  import { focusOutside } from '$lib/actions/focus-outside';
  import ButtonContextMenu from '$lib/components/shared-components/context-menu/button-context-menu.svelte';
  import { AppRoute, QueryParameter } from '$lib/constants';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { genderRingClass } from '$lib/utils/person-gender';
  import { type PersonResponseDto, type RelationshipGender } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import {
    mdiAccountMultipleCheckOutline,
    mdiCalendarEditOutline,
    mdiCheck,
    mdiDotsVertical,
    mdiEyeOffOutline,
    mdiHeart,
    mdiHeartMinusOutline,
    mdiHeartOutline,
  } from '@mdi/js';
  import { t } from 'svelte-i18n';
  import ImageThumbnail from '../assets/thumbnail/image-thumbnail.svelte';
  import MenuOption from '../shared-components/context-menu/menu-option.svelte';

  interface Props {
    person: PersonResponseDto;
    /** What this person's relationships state they are, when anything does. */
    gender?: RelationshipGender | null;
    /**
     * The card is being picked from a list rather than opened. It gives up its link and its menu
     * for as long as that lasts: a page where a click means two different things depending on where
     * it lands is a page that cannot be selected from quickly, which is the whole point of the mode.
     */
    selecting?: boolean;
    selected?: boolean;
    onSetBirthDate: () => void;
    onMergePeople: () => void;
    onHidePerson: () => void;
    onToggleFavorite: () => void;
  }

  let {
    person,
    gender,
    selecting = false,
    selected = false,
    onSetBirthDate,
    onMergePeople,
    onHidePerson,
    onToggleFavorite,
  }: Props = $props();

  let showVerticalDots = $state(false);
</script>

<div
  id="people-card"
  class="relative"
  onmouseenter={() => (showVerticalDots = true)}
  onmouseleave={() => (showVerticalDots = false)}
  role="group"
  use:focusOutside={{ onFocusOut: () => (showVerticalDots = false) }}
>
  {#snippet thumbnail()}
    <div class="w-full h-full rounded-xl brightness-95 filter">
      <ImageThumbnail
        shadow
        url={getPeopleThumbnailUrl(person)}
        altText={person.name}
        title={person.name}
        widthStyle="100%"
        circle
        preload={false}
        class={selected ? 'ring-4 ring-primary' : genderRingClass(gender)}
      />
      {#if person.isFavorite}
        <div class="absolute top-4 start-4">
          <Icon icon={mdiHeart} size="24" class="text-white" />
        </div>
      {/if}
      {#if selecting && selected}
        <div class="absolute top-2 end-2 rounded-full bg-primary p-1 text-white" title={$t('selected')}>
          <Icon icon={mdiCheck} size="1em" aria-hidden />
        </div>
      {/if}
    </div>
  {/snippet}

  {#if selecting}
    {@render thumbnail()}
  {:else}
    <a
      href="{AppRoute.PEOPLE}/{person.id}?{QueryParameter.PREVIOUS_ROUTE}={AppRoute.PEOPLE}"
      draggable="false"
      onfocus={() => (showVerticalDots = true)}
    >
      {@render thumbnail()}
    </a>
  {/if}

  {#if showVerticalDots && !selecting}
    <div class="absolute top-2 end-2 z-1">
      <ButtonContextMenu
        buttonClass="icon-white-drop-shadow"
        color="secondary"
        size="medium"
        variant="filled"
        icon={mdiDotsVertical}
        title={$t('show_person_options')}
      >
        <MenuOption onClick={onHidePerson} icon={mdiEyeOffOutline} text={$t('hide_person')} />
        <MenuOption onClick={onSetBirthDate} icon={mdiCalendarEditOutline} text={$t('set_date_of_birth')} />
        <MenuOption onClick={onMergePeople} icon={mdiAccountMultipleCheckOutline} text={$t('merge_people')} />
        <MenuOption
          onClick={onToggleFavorite}
          icon={person.isFavorite ? mdiHeartMinusOutline : mdiHeartOutline}
          text={person.isFavorite ? $t('unfavorite') : $t('to_favorite')}
        />
      </ButtonContextMenu>
    </div>
  {/if}
</div>
