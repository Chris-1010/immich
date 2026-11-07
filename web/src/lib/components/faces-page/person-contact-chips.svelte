<script lang="ts">
  import { clickOutside } from '$lib/actions/click-outside';
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { AppRoute } from '$lib/constants';
  import { locale } from '$lib/stores/preferences.store';
  import { copyToClipboard, getPeopleThumbnailUrl } from '$lib/utils';
  import {
    CONTACT_KINDS,
    contactFieldAddLabel,
    contactFieldLabel,
    currentOfKind,
    isIconOnlyKind,
  } from '$lib/utils/contact-fields';
  import { getDetailSubtitle } from '$lib/utils/person-detail-dates';
  import { genderRingClass } from '$lib/utils/person-gender';
  import {
    PersonDetailKind,
    type PersonDetailResponseDto,
    type PersonResponseDto,
    type RelationshipGender,
  } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import {
    mdiBriefcase,
    mdiBriefcaseOutline,
    mdiCakeVariant,
    mdiCakeVariantOutline,
    mdiContentCopy,
    mdiEmail,
    mdiEmailOutline,
    mdiHome,
    mdiHomeOutline,
    mdiMapMarker,
    mdiPencilOutline,
    mdiPhone,
    mdiPhoneOutline,
  } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { t } from 'svelte-i18n';

  interface Props {
    person: PersonResponseDto;
    details: PersonDetailResponseDto[];
    genders?: Record<string, RelationshipGender>;
    /** Opens the editor for one kind, whether to add the first value or to change what is there. */
    onEdit: (kind: PersonDetailKind) => void;
    /** Ends one Current value this month and saves, which moves it to Past with nothing in its place. */
    onEnd: (detail: PersonDetailResponseDto) => void;
    /** Opens the birth-date modal, which is where the birthday has always been set. */
    onEditBirthDate: () => void;
  }

  let { person, details, genders = {}, onEdit, onEnd, onEditBirthDate }: Props = $props();

  /** Faces shown in the popover before the rest are folded into a count. */
  const POPOVER_FACES = 8;

  /** How much clear space is left between the popover and the edge of the window, in pixels. */
  const VIEWPORT_MARGIN = 8;

  /** Filled when set, outlined when not, so the faded empty chips read as slots rather than values. */
  const icons: Record<PersonDetailKind, { set: string; unset: string }> = {
    [PersonDetailKind.Work]: { set: mdiBriefcase, unset: mdiBriefcaseOutline },
    [PersonDetailKind.Home]: { set: mdiHome, unset: mdiHomeOutline },
    [PersonDetailKind.Email]: { set: mdiEmail, unset: mdiEmailOutline },
    [PersonDetailKind.Phone]: { set: mdiPhone, unset: mdiPhoneOutline },
  };

  /** A value carries a pin when it has a point on the map; only a Home or Work can have one. */
  const isPinned = ({ latitude, longitude }: PersonDetailResponseDto) => latitude != null && longitude != null;

  const chips = $derived(CONTACT_KINDS.map((kind) => ({ kind, values: currentOfKind(details, kind) })));

  /**
   * "12 Mar 1990 (36)". The age is whole years as of today, the same sum the asset viewer does
   * against the date a photo was taken.
   */
  const birthday = $derived.by(() => {
    if (!person.birthDate) {
      return;
    }

    const born = DateTime.fromISO(person.birthDate);

    return $t('contact_field_birthday', {
      values: {
        date: born.toLocaleString({ day: 'numeric', month: 'short', year: 'numeric' }, { locale: $locale }),
        age: Math.floor(DateTime.now().diff(born, 'years').years),
      },
    });
  });

  let openKind = $state<PersonDetailKind>();
  let popoverAnchor = $state<{ below: number; above: number; left: number }>();
  let popover = $state<HTMLDivElement>();
  let popoverPlacement = $state<{ top: number; left: number }>();

  const openValues = $derived(openKind ? currentOfKind(details, openKind) : []);

  /**
   * What a set chip does: email and phone are copied, since that is what they are for, and every
   * set chip opens its popover, which is the way to the editor and to End. The first value is the
   * one copied; the popover offers the rest one by one.
   */
  const handleChip = (event: MouseEvent, kind: PersonDetailKind, values: PersonDetailResponseDto[]) => {
    if (values.length === 0) {
      onEdit(kind);
      return;
    }

    if (isIconOnlyKind(kind)) {
      void copyToClipboard(values[0].value);
    }

    if (openKind === kind) {
      openKind = undefined;
      return;
    }

    // Anchored to the viewport, as the details box anchors its own popover, so the header's
    // overflow can never clip it. Both edges are kept until it has been measured.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    popoverAnchor = { below: rect.bottom + 4, above: rect.top - 4, left: rect.left };
    popoverPlacement = undefined;
    openKind = kind;
  };

  /** Ending the last value leaves nothing to show, so the popover goes with it. */
  const handleEnd = (detail: PersonDetailResponseDto) => {
    if (openValues.length <= 1) {
      openKind = undefined;
    }

    onEnd(detail);
  };

  const handleEdit = (kind: PersonDetailKind) => {
    openKind = undefined;
    onEdit(kind);
  };

  const asSubtitle = (detail: PersonDetailResponseDto) => {
    const { key, values } = getDetailSubtitle(detail, $locale);

    return $t(key, { values });
  };

  // Placed below the chip, then measured and flipped above or slid along the edge if it overhangs,
  // the same way the details box places its popover. Nothing is drawn until that has happened.
  $effect(() => {
    const element = popover;
    const anchor = popoverAnchor;

    if (!element || !anchor) {
      return;
    }

    const { width, height } = element.getBoundingClientRect();
    const fitsBelow = anchor.below + height + VIEWPORT_MARGIN <= globalThis.innerHeight;

    popoverPlacement = {
      top: Math.max(VIEWPORT_MARGIN, fitsBelow ? anchor.below : anchor.above - height),
      left: Math.max(VIEWPORT_MARGIN, Math.min(anchor.left, globalThis.innerWidth - width - VIEWPORT_MARGIN)),
    };
  });

  // A value ended from somewhere else (the editor, the details modal) can leave the popover open on
  // a kind with nothing Current left in it.
  $effect(() => {
    if (openKind && openValues.length === 0) {
      openKind = undefined;
    }
  });
</script>

<!-- Wraps rather than scrolls, so at phone width the chips fold onto a second line instead of
     pushing the header wider than the screen. -->
<ul class="flex flex-wrap place-items-center gap-x-3 gap-y-1 text-sm" aria-label={$t('contact_fields')}>
  <li>
    <button
      type="button"
      class="flex place-items-center gap-1 rounded-full {birthday
        ? 'text-gray-500 dark:text-gray-400 hover:text-primary'
        : 'text-gray-400/60 dark:text-gray-500/60 hover:text-primary'}"
      title={birthday ? $t('set_date_of_birth') : $t('contact_field_add_birthday')}
      aria-label={birthday ? undefined : $t('contact_field_add_birthday')}
      onclick={onEditBirthDate}
    >
      <Icon icon={birthday ? mdiCakeVariant : mdiCakeVariantOutline} size="1.125em" aria-hidden />
      {#if birthday}
        <span>{birthday}</span>
      {/if}
    </button>
  </li>

  {#each chips as { kind, values } (kind)}
    {@const first = values[0]}
    {@const label = $t(contactFieldLabel[kind])}
    <li>
      <button
        type="button"
        class="flex max-w-48 place-items-center gap-1 rounded-full {first
          ? 'text-gray-500 dark:text-gray-400 hover:text-primary'
          : 'text-gray-400/60 dark:text-gray-500/60 hover:text-primary'}"
        title={first ? `${label}: ${values.map(({ value }) => value).join(', ')}` : $t(contactFieldAddLabel[kind])}
        aria-label={first ? `${label}: ${first.value}` : $t(contactFieldAddLabel[kind])}
        aria-expanded={first ? openKind === kind : undefined}
        onclick={(event) => handleChip(event, kind, values)}
      >
        <Icon icon={first ? icons[kind].set : icons[kind].unset} size="1.125em" class="shrink-0" aria-hidden />
        {#if first && !isIconOnlyKind(kind)}
          <span class="truncate text-primary">{first.value}</span>
        {/if}
        {#if first && isPinned(first)}
          <span class="shrink-0 text-gray-400 dark:text-gray-500" title={$t('contact_field_pinned')}>
            <Icon icon={mdiMapMarker} size="0.875em" aria-hidden />
          </span>
        {/if}
        {#if values.length > 1}
          <span class="shrink-0 text-xs">+{values.length - 1}</span>
        {/if}
      </button>
    </li>
  {/each}
</ul>

{#if openKind && popoverAnchor && openValues.length > 0}
  {@const kind = openKind}
  <div
    bind:this={popover}
    role="dialog"
    aria-label={$t(contactFieldLabel[kind])}
    class="fixed z-10 max-h-[40vh] w-max min-w-48 max-w-[min(22rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 dark:border-immich-dark-gray bg-light p-2 shadow-lg"
    style="top: {(popoverPlacement ?? { top: popoverAnchor.below }).top}px; left: {(popoverPlacement ?? popoverAnchor)
      .left}px; visibility: {popoverPlacement ? 'visible' : 'hidden'}"
    use:clickOutside={{
      onOutclick: () => (openKind = undefined),
      onEscape: () => (openKind = undefined),
    }}
  >
    <ul class="flex flex-col gap-2">
      {#each openValues as detail (detail.id)}
        {@const alongWith = detail.alongWith.current}
        <li class="flex flex-col gap-0.5 px-2">
          <div class="flex place-items-center gap-2">
            <span class="grow break-all text-sm text-primary">{detail.value}</span>
            {#if isPinned(detail)}
              <span
                role="img"
                class="shrink-0 text-gray-400 dark:text-gray-500"
                title={$t('contact_field_pinned')}
                aria-label={$t('contact_field_pinned')}
              >
                <Icon icon={mdiMapMarker} size="0.875em" aria-hidden />
              </span>
            {/if}
            {#if isIconOnlyKind(kind)}
              <button
                type="button"
                class="shrink-0 rounded-full p-0.5 text-gray-500 dark:text-gray-400 hover:text-primary"
                aria-label={$t('copy_to_clipboard')}
                onclick={() => copyToClipboard(detail.value)}
              >
                <Icon icon={mdiContentCopy} size="1em" aria-hidden />
              </button>
            {/if}
            <button
              type="button"
              class="shrink-0 rounded-full px-1 text-xs text-gray-500 dark:text-gray-400 hover:text-danger"
              onclick={() => handleEnd(detail)}
            >
              {$t('detail_end')}
            </button>
          </div>

          <span class="text-xs text-gray-500 dark:text-gray-400">{asSubtitle(detail)}</span>

          <!-- Who holds the same value now, rendered as the details box renders a row's faces. Past
               holders are left to the box's Past tab: a chip is about the present. -->
          {#if alongWith.total > 0}
            <span class="flex flex-wrap place-items-center gap-1 pt-0.5">
              {#each alongWith.people.slice(0, POPOVER_FACES) as face (face.id)}
                <a href="{AppRoute.PEOPLE}/{face.id}" title={face.name || $t('person')}>
                  <ImageThumbnail
                    circle
                    shadow
                    url={getPeopleThumbnailUrl(face)}
                    altText={face.name}
                    widthStyle="1.25rem"
                    heightStyle="1.25rem"
                    class={genderRingClass(genders[face.id])}
                  />
                </a>
              {/each}
              {#if alongWith.total > POPOVER_FACES}
                <span class="text-xs text-gray-500 dark:text-gray-400">+{alongWith.total - POPOVER_FACES}</span>
              {/if}
            </span>
          {/if}
        </li>
      {/each}
    </ul>

    <div class="flex justify-end pt-2">
      <button
        type="button"
        class="flex place-items-center gap-1 px-2 text-xs text-gray-500 dark:text-gray-400 hover:text-primary"
        onclick={() => handleEdit(kind)}
      >
        <Icon icon={mdiPencilOutline} size="1.125em" aria-hidden />
        {$t('edit')}
      </button>
    </div>
  </div>
{/if}
