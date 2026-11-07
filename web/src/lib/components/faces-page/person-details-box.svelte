<script lang="ts">
  import { clickOutside } from '$lib/actions/click-outside';
  import ImageThumbnail from '$lib/components/assets/thumbnail/image-thumbnail.svelte';
  import { AppRoute } from '$lib/constants';
  import { locale } from '$lib/stores/preferences.store';
  import { getPeopleThumbnailUrl } from '$lib/utils';
  import { isFreeTextDetail } from '$lib/utils/contact-fields';
  import { getDetailSubtitle, isCurrentDetail, sortPastDetails } from '$lib/utils/person-detail-dates';
  import { genderRingClass } from '$lib/utils/person-gender';
  import type { AlongWithPersonResponseDto, PersonDetailResponseDto, RelationshipGender } from '@immich/sdk';
  import { Icon } from '@immich/ui';
  import { mdiHistory, mdiPencilOutline, mdiPlus } from '@mdi/js';
  import { DateTime } from 'luxon';
  import { onDestroy } from 'svelte';
  import { t } from 'svelte-i18n';

  interface Props {
    details: PersonDetailResponseDto[];
    genders?: Record<string, RelationshipGender>;
    onEdit: () => void;
  }

  let { details, genders = {}, onEdit }: Props = $props();

  /** Faces shown inline before the rest are folded into a `+N`. */
  const INLINE_FACES = 3;

  /** Slow enough to be read past rather than watched, in pixels per second. */
  const SCROLL_SPEED = 8;

  /** How long the list rests at the top and the bottom before turning around, in milliseconds. */
  const TURN_PAUSE = 1500;

  /**
   * Which half of the list is on show. Current is the default and the only one there is until
   * something has been moved to Past.
   */
  let tab = $state<'current' | 'past'>('current');

  /**
   * In the order they were arranged in, which is the order the server sends them. Contact fields
   * are left out: a Current Home or Email already has its chip under the name. Once ended they are
   * history like anything else, so Past keeps them.
   */
  const currentDetails = $derived(details.filter((detail) => isCurrentDetail(detail) && isFreeTextDetail(detail)));
  const pastDetails = $derived(sortPastDetails(details));

  // Guarded here as well as reset below, so the frame between the last Past row going and the
  // effect running never draws an empty Past tab with no toggle left to leave it by.
  const activeTab = $derived(pastDetails.length > 0 ? tab : 'current');
  const shownDetails = $derived(activeTab === 'current' ? currentDetails : pastDetails);

  const tabs = $derived([
    { id: 'current' as const, label: $t('details_current') },
    { id: 'past' as const, label: $t('details_past', { values: { count: pastDetails.length } }) },
  ]);

  $effect(() => {
    if (pastDetails.length === 0) {
      tab = 'current';
    }
  });

  /**
   * Who to show beside a row. A Current row is about now, so it shows who holds the same thing
   * now; a Past row is history, so it shows everyone who ever held it, those who still do first.
   */
  const asAlongWith = (detail: PersonDetailResponseDto) => {
    const { current, past } = detail.alongWith;

    return isCurrentDetail(detail)
      ? current
      : { people: [...current.people, ...past.people], total: current.total + past.total };
  };

  /**
   * Whether a Current row's popover holds people the row never shows inline: those who held it
   * before. With few enough current holders to fit, there is no `+N` to open the popover from, so
   * a small history mark stands in for it rather than leaving them out of reach.
   */
  const hasHiddenPast = (detail: PersonDetailResponseDto) => isCurrentDetail(detail) && detail.alongWith.past.total > 0;

  /** Says who the trigger stands for, with those who used to share it named apart from those who do. */
  const asHiddenLabel = (detail: PersonDetailResponseDto) => {
    const { current, past } = detail.alongWith;

    if (!isCurrentDetail(detail)) {
      return $t('along_with_count', { values: { count: current.total + past.total } });
    }

    return [
      current.total > 0 && $t('along_with_current_count', { values: { count: current.total } }),
      past.total > 0 && $t('along_with_past_count', { values: { count: past.total } }),
    ]
      .filter(Boolean)
      .join(', ');
  };

  /** "Since Mar 2019", "As of Oct 2026", "Mar 2019 – Oct 2026" or "Until Oct 2026". */
  const asSubtitle = (detail: PersonDetailResponseDto) => {
    const { key, values } = getDetailSubtitle(detail, $locale);

    return $t(key, { values });
  };

  let box = $state<HTMLDivElement>();
  let paused = $state(false);
  let openPopover = $state<string>();
  let popoverAnchor = $state<{ below: number; above: number; left: number }>();
  let popover = $state<HTMLDivElement>();
  let popoverPlacement = $state<{ top: number; left: number }>();

  /** How much clear space is left between the popover and the edge of the window, in pixels. */
  const VIEWPORT_MARGIN = 8;

  let frame: number | undefined;
  let lastFrameAt: number | undefined;
  let direction = 1;
  let restingUntil = 0;

  /**
   * How long ago the detail was recorded, in the largest unit that fits: two years and nine months
   * reads as "2y", not "2y 9mo". The exact date follows it, since "2y ago" alone is not something
   * anyone can act on.
   */
  const asAge = (createdAt: string) => {
    const created = DateTime.fromISO(createdAt);
    const { years, months, days, hours, minutes } = DateTime.now()
      .diff(created, ['years', 'months', 'days', 'hours', 'minutes'])
      .toObject();

    const age =
      Math.floor(years ?? 0) > 0
        ? $t('detail_age_years', { values: { count: Math.floor(years ?? 0) } })
        : Math.floor(months ?? 0) > 0
          ? $t('detail_age_months', { values: { count: Math.floor(months ?? 0) } })
          : Math.floor(days ?? 0) > 0
            ? $t('detail_age_days', { values: { count: Math.floor(days ?? 0) } })
            : Math.floor(hours ?? 0) > 0
              ? $t('detail_age_hours', { values: { count: Math.floor(hours ?? 0) } })
              : $t('detail_age_minutes', { values: { count: Math.max(0, Math.floor(minutes ?? 0)) } });

    const date = created.toLocaleString({ day: 'numeric', month: 'short', year: 'numeric' }, { locale: $locale });

    return $t('detail_created', { values: { age, date } });
  };

  /**
   * What this person has in common with the subject beyond the pair everyone in the group shares.
   *
   * Subdetails lead, because they are the narrower answer: sharing "Class of 2016" under a school
   * says more than sharing a hometown somewhere else entirely, and the order here is the order the
   * faces themselves are already in.
   */
  const asShared = (person: AlongWithPersonResponseDto) =>
    [...person.sharedSubdetails.map(({ key, value }) => `${key} ${value}`), ...person.sharedKeys].join(', ');

  const asAlso = (person: AlongWithPersonResponseDto) => {
    const shared = asShared(person);

    return shared.length > 0 ? $t('along_with_also', { values: { keys: shared } }) : undefined;
  };

  /**
   * A face names who it is and, when there is one, what else they have in common with this person.
   * The faces are ordered by how much that is, so the ones worth hovering are the ones in front.
   *
   * The name sits on a line of its own, since the shared details run long enough that a name tacked
   * onto the front of them is the part that gets lost.
   */
  const asFaceTitle = (person: AlongWithPersonResponseDto) => {
    const name = person.name || $t('person');
    const shared = asShared(person);

    return shared.length > 0 ? `${name}\n${$t('along_with_also_title', { values: { keys: shared } })}` : name;
  };

  /**
   * Scrolls the box end to end and back for as long as the content does not fit.
   *
   * The list is moved by `scrollTop` rather than by transforming its contents, so that the box
   * stays an ordinary scrollable element: a wheel or a drag keeps working while the motion is
   * paused, which it would not if the position were owned by a transform.
   */
  const step = (now: number) => {
    frame = requestAnimationFrame(step);

    const element = box;
    if (!element) {
      return;
    }

    const travel = element.scrollHeight - element.clientHeight;
    if (paused || travel <= 0) {
      // Losing the timestamp stops a pause from being paid back as a jump on resume.
      lastFrameAt = undefined;
      return;
    }

    if (now < restingUntil) {
      lastFrameAt = undefined;
      return;
    }

    const elapsed = lastFrameAt === undefined ? 0 : now - lastFrameAt;
    lastFrameAt = now;

    const next = element.scrollTop + (direction * SCROLL_SPEED * elapsed) / 1000;

    if (next <= 0 || next >= travel) {
      element.scrollTop = next <= 0 ? 0 : travel;
      direction = -direction;
      restingUntil = now + TURN_PAUSE;
      return;
    }

    element.scrollTop = next;
  };

  $effect(() => {
    // Motion is decoration. Anyone who has asked their system for less of it gets a box that simply
    // sits still and scrolls by hand.
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    frame = requestAnimationFrame(step);

    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
        frame = undefined;
      }
    };
  });

  // A different list starts from its top, and rests there a moment before moving, the same as it
  // does on arriving at either end.
  $effect(() => {
    void activeTab;

    if (box) {
      box.scrollTop = 0;
    }

    direction = 1;
    lastFrameAt = undefined;
    restingUntil = performance.now() + TURN_PAUSE;
    openPopover = undefined;
  });

  onDestroy(() => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  });

  const handlePopover = (event: MouseEvent, detailId: string) => {
    if (openPopover === detailId) {
      openPopover = undefined;
      return;
    }

    // Anchored to the viewport rather than to the row, because the row is inside a scrolling box
    // that would otherwise clip the popover the moment it opened. Both edges of the button are
    // kept, since which of them the popover hangs from is only known once it has been measured.
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    popoverAnchor = { below: rect.bottom + 4, above: rect.top - 4, left: rect.left };
    popoverPlacement = undefined;
    openPopover = detailId;
  };

  /**
   * Pulls the popover back inside the window once its real size is known.
   *
   * The size cannot be guessed ahead of time: the list is as wide as the longest name and as tall
   * as the number of faces, up to the cap the class sets. So it is placed below the button, then
   * measured and moved above it if that does not fit, and slid along the horizontal edge if the
   * width overhangs. Nothing is drawn until that has happened, otherwise the first frame is a
   * visible jump.
   *
   * Reading only the anchor and writing only the placement is what keeps this from re-running
   * itself: the measurement moves the box, and moving the box does not change the measurement.
   */
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
</script>

<!-- Nothing to list rather than nothing recorded: a person holding only a Current Home has no
     free-text detail and no history, so the box has no rows to show and offers to add some. -->
{#if currentDetails.length === 0 && pastDetails.length === 0}
  <button
    type="button"
    class="flex place-items-center gap-1 p-4 sm:px-6 text-sm text-gray-500 dark:text-gray-400 hover:text-primary"
    onclick={onEdit}
  >
    <Icon icon={mdiPlus} size="1.125em" aria-hidden />
    {$t('add_details')}
  </button>
{:else}
  <!-- Full width of the space it is given rather than a width of its own: the cap that matters is
       the half-screen ceiling on the cell around it, and a fixed width inside that would leave the
       box floating short of the edge of the page. -->
  <div class="p-4 sm:px-6 w-full">
    <!-- Only once there is history to switch to. Transparent behind the pills, so nothing here
         paints a background of its own over whatever the header is later given behind it. -->
    {#if pastDetails.length > 0}
      <div role="tablist" aria-label={$t('person_details')} class="mb-1 flex gap-1 text-xs">
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

    <!-- Three two-line rows tall whatever the list holds, so the header never changes height as
         details are added. Anything past the third row is what the scrolling is for. -->
    <div
      bind:this={box}
      role={pastDetails.length > 0 ? 'tabpanel' : 'group'}
      aria-label={$t('person_details')}
      class="h-35 overflow-y-auto overscroll-contain rounded-2xl bg-subtle/40 px-3 py-1"
      onmouseenter={() => (paused = true)}
      onmouseleave={() => (paused = false)}
      onfocusin={() => (paused = true)}
      onfocusout={() => (paused = false)}
    >
      <!-- One column as wide as the longest key and no wider, so the values line up down the box
           without any key being clipped to a stub. Capped at a third of the width, past which a key
           long enough to crowd out its own value is the one that gets truncated. Each row opts into
           the shared columns with `subgrid`, which is what lets the row stay a real element: the
           tooltip and the row height need a box, and `display: contents` would generate neither. -->
      <ul class="grid grid-cols-[fit-content(33%)_1fr_auto]">
        {#each shownDetails as detail (detail.id)}
          {@const alongWith = asAlongWith(detail)}
          {@const hidden = Math.max(0, alongWith.total - INLINE_FACES)}
          <!-- Two lines: the fact itself, then when it held. The second line sits under the value
               and runs on under the faces, since the key column is already as narrow as it can be. -->
          <li
            class="col-span-3 grid grid-cols-subgrid grid-rows-[1.5rem_1rem] place-items-center gap-x-4 py-0.5 text-sm"
            title={asAge(detail.createdAt)}
          >
            <span class="w-full truncate text-gray-500 dark:text-gray-400">{detail.key}</span>

            <span class="w-full truncate text-primary">{detail.value}</span>

            <!-- Last column, so the faces line up against the far edge of the box rather than
                 tracking the end of whatever value happens to precede them. -->
            <span class="flex shrink-0 place-items-center gap-1">
              {#each alongWith.people.slice(0, INLINE_FACES) as person (person.id)}
                <a href="{AppRoute.PEOPLE}/{person.id}" title={asFaceTitle(person)}>
                  <ImageThumbnail
                    circle
                    shadow
                    url={getPeopleThumbnailUrl(person)}
                    altText={person.name}
                    widthStyle="1.25rem"
                    heightStyle="1.25rem"
                    class={genderRingClass(genders[person.id])}
                  />
                </a>
              {/each}

              {#if hidden > 0 || hasHiddenPast(detail)}
                <button
                  type="button"
                  class="rounded-full px-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary"
                  aria-label={asHiddenLabel(detail)}
                  onclick={(event) => handlePopover(event, detail.id)}
                >
                  {#if hidden > 0}
                    +{hidden}
                  {:else}
                    <Icon icon={mdiHistory} size="1em" aria-hidden />
                  {/if}
                </button>
              {/if}
            </span>

            <span class="col-span-2 col-start-2 w-full truncate text-xs leading-4 text-gray-500 dark:text-gray-400">
              {asSubtitle(detail)}
            </span>
          </li>
        {:else}
          <!-- Everything has been moved to Past. The toggle above is the way to it. -->
          <li class="col-span-3 py-1 text-sm text-gray-500 dark:text-gray-400">{$t('details_none_current')}</li>
        {/each}
      </ul>
    </div>

    <!-- Outside the scrolling element, so the only way back into the modal cannot drift out of
         sight as the list scrolls past it. -->
    <div class="flex justify-end pt-1">
      <button
        type="button"
        class="flex place-items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-primary"
        onclick={onEdit}
      >
        <Icon icon={mdiPencilOutline} size="1.125em" aria-hidden />
        {$t('edit_details')}
      </button>
    </div>
  </div>

  {#if openPopover && popoverAnchor}
    {@const detail = details.find(({ id }) => id === openPopover)}
    {#if detail}
      <!-- As wide as its longest line and no wider, up to what the window allows: the names and the
           details they share are the whole point of opening this, so they wrap rather than being cut
           off. Two fifths of the window tall at most, and scrollable past that. -->
      <div
        bind:this={popover}
        class="fixed z-10 max-h-[40vh] w-max max-w-[min(24rem,calc(100vw-1rem))] overflow-y-auto overscroll-contain rounded-2xl border border-gray-200 dark:border-immich-dark-gray bg-light p-2 shadow-lg"
        style="top: {(popoverPlacement ?? { top: popoverAnchor.below }).top}px; left: {(
          popoverPlacement ?? popoverAnchor
        ).left}px; visibility: {popoverPlacement ? 'visible' : 'hidden'}"
        use:clickOutside={{
          onOutclick: () => (openPopover = undefined),
          onEscape: () => (openPopover = undefined),
        }}
      >
        <p class="px-2 pb-1 text-xs text-gray-500 dark:text-gray-400">
          {$t('along_with', { values: { key: detail.key, value: detail.value } })}
        </p>
        <!-- One column as wide as the longest name and no wider, so every "also" starts at the same
             place down the list rather than tracking the end of the name in front of it. The row and
             the link inside it both opt into the shared columns with `subgrid`, since the link has to
             stay one element to be one hover target and one thing to click. -->
        <ul class="grid grid-cols-[auto_auto_1fr]">
          <!-- Who holds it now, then who used to, each under a heading of its own. A group nobody is
               in is left out rather than headed "(0)". Both share the one grid, so the "also" column
               lines up across the two. -->
          {#each [{ id: 'current', group: detail.alongWith.current }, { id: 'past', group: detail.alongWith.past }] as { id, group } (id)}
            {#if group.total > 0}
              <li
                class="col-span-3 px-2 pt-1 text-xs font-medium text-gray-500 dark:text-gray-400"
                title={$t(id === 'current' ? 'along_with_current_count' : 'along_with_past_count', {
                  values: { count: group.total },
                })}
              >
                {$t(id === 'current' ? 'along_with_currently' : 'along_with_previously', {
                  values: { count: group.total },
                })}
              </li>

              {#each group.people as person (person.id)}
                <!-- What this person has in common beyond the pair everyone here shares. The list is
                     already ordered by how much that is, so the labelled ones lead. -->
                {@const also = asAlso(person)}
                <li class="col-span-3 grid grid-cols-subgrid">
                  <a
                    href="{AppRoute.PEOPLE}/{person.id}"
                    class="col-span-3 grid grid-cols-subgrid items-start gap-2 rounded-xl p-1 hover:bg-subtle"
                  >
                    <ImageThumbnail
                      circle
                      shadow
                      url={getPeopleThumbnailUrl(person)}
                      altText={person.name}
                      widthStyle="1.5rem"
                      heightStyle="1.5rem"
                      class="shrink-0 {genderRingClass(genders[person.id])}"
                    />
                    <span class="text-sm text-primary">{person.name || $t('person')}</span>

                    <!-- Line height borrowed from the name beside it, so the two first lines sit on
                         the same baseline despite the smaller text. -->
                    <span class="text-xs leading-5 text-gray-500 dark:text-gray-400">{also ?? ''}</span>
                  </a>
                </li>
              {/each}

              <!-- The heading counts the whole group while the server sends only the head of it, so
                   a group that outgrew the list says so rather than quietly ending at the fiftieth
                   face. Those fifty are the closest fifty: the cap is applied after the ranking, not
                   before it. -->
              {#if group.total > group.people.length}
                <li class="col-span-3 px-2 pb-1 text-xs text-gray-500 dark:text-gray-400">
                  {$t('along_with_showing', { values: { shown: group.people.length, total: group.total } })}
                </li>
              {/if}
            {/if}
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
{/if}
