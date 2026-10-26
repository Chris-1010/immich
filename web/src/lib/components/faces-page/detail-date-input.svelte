<script lang="ts">
  import { locale } from '$lib/stores/preferences.store';
  import { PersonDetailDatePrecision } from '@immich/sdk';
  import { Info } from 'luxon';
  import { t } from 'svelte-i18n';

  interface Props {
    /** "Since" or "Until", shown before the inputs and folded into their accessible names. */
    label: string;
    /** A full `yyyy-MM-dd` date, or null when nothing is recorded. */
    date: string | null | undefined;
    precision: PersonDetailDatePrecision | null | undefined;
    invalid?: boolean;
  }

  let { label, date = $bindable(), precision = $bindable(), invalid = false }: Props = $props();

  /**
   * Typed text rather than what is bound, so a year half way through being typed ("20") is left on
   * screen without being written back as a date nobody meant.
   *
   * Read once from the bound date: the row this sits on is keyed, and the only outside change that
   * can happen to it (End or Restore) mounts or unmounts the input rather than editing it.
   */
  let year = $state(date ? date.slice(0, 4) : '');
  let month = $state(date && precision !== PersonDetailDatePrecision.Year ? date.slice(5, 7) : '');

  const months = $derived(Info.months('short', { locale: $locale }));

  /**
   * Writes back whatever the inputs now say. A blank year clears the date outright, which is how a
   * date is removed; a month without a year is not a date at all and is held back until one is
   * typed. A month left blank makes it a year-precision date, never a fake January.
   */
  const commit = () => {
    const typed = year.trim();

    if (!typed) {
      date = null;
      precision = null;
      return;
    }

    if (!/^\d{4}$/.test(typed)) {
      return;
    }

    date = `${typed}-${month || '01'}-01`;
    precision = month ? PersonDetailDatePrecision.Month : PersonDetailDatePrecision.Year;
  };
</script>

<span class="inline-flex place-items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
  <span>{label}</span>
  <select
    class="rounded-lg border bg-transparent px-1 py-0.5 text-xs {invalid
      ? 'border-danger'
      : 'border-gray-300 dark:border-gray-600'}"
    aria-label={$t('detail_date_month', { values: { label } })}
    bind:value={month}
    onchange={commit}
  >
    <option value="">—</option>
    {#each months as name, index (index)}
      <option value={String(index + 1).padStart(2, '0')}>{name}</option>
    {/each}
  </select>
  <input
    class="w-14 rounded-lg border bg-transparent px-1 py-0.5 text-xs {invalid
      ? 'border-danger'
      : 'border-gray-300 dark:border-gray-600'}"
    inputmode="numeric"
    maxlength="4"
    placeholder={$t('year')}
    aria-label={$t('detail_date_year', { values: { label } })}
    aria-invalid={invalid}
    bind:value={year}
    oninput={commit}
  />
</span>
