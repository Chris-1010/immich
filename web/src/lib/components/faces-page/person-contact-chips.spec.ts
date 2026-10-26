import PersonContactChips from '$lib/components/faces-page/person-contact-chips.svelte';
import { copyToClipboard } from '$lib/utils';
import { PersonDetailKind, type PersonDetailResponseDto, type PersonResponseDto } from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

vi.mock('$lib/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('$lib/utils')>()),
  copyToClipboard: vi.fn(),
}));

const person = (birthDate: string | null = null) => ({ id: 'person-1', name: 'Ethan', birthDate }) as PersonResponseDto;

const detail = (
  id: string,
  kind: PersonDetailKind | null,
  value: string,
  overrides: Partial<PersonDetailResponseDto> = {},
): PersonDetailResponseDto => ({
  id,
  key: kind ?? 'Works at',
  value,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  since: null,
  sincePrecision: null,
  until: null,
  untilPrecision: null,
  kind,
  latitude: null,
  longitude: null,
  subdetails: [],
  alongWith: { current: { total: 0, people: [] }, past: { total: 0, people: [] } },
  ...overrides,
});

const props = (details: PersonDetailResponseDto[], birthDate: string | null = null) => ({
  person: person(birthDate),
  details,
  onEdit: vi.fn(),
  onEnd: vi.fn(),
  onEditBirthDate: vi.fn(),
});

describe('PersonContactChips', () => {
  beforeEach(() => vi.clearAllMocks());

  it('offers every kind as an empty slot when nothing is recorded', () => {
    render(PersonContactChips, props([]));

    for (const key of [
      'contact_field_add_birthday',
      'contact_field_add_work',
      'contact_field_add_home',
      'contact_field_add_email',
      'contact_field_add_phone',
    ]) {
      expect(screen.getByRole('button', { name: key })).toBeInTheDocument();
    }
  });

  it('opens the editor for the kind an empty slot stands for, and the birth-date modal for the birthday', async () => {
    const user = userEvent.setup();
    const handlers = props([]);
    render(PersonContactChips, handlers);

    await user.click(screen.getByRole('button', { name: 'contact_field_add_home' }));
    expect(handlers.onEdit).toHaveBeenCalledWith(PersonDetailKind.Home);

    await user.click(screen.getByRole('button', { name: 'contact_field_add_birthday' }));
    expect(handlers.onEditBirthDate).toHaveBeenCalled();
  });

  it('shows the birthday with an age once one is set', () => {
    render(PersonContactChips, props([], '1990-03-12'));

    expect(screen.queryByRole('button', { name: 'contact_field_add_birthday' })).not.toBeInTheDocument();
    expect(screen.getByText('contact_field_birthday')).toBeInTheDocument();
  });

  it('shows the value of a place but only the icon of an email', () => {
    render(
      PersonContactChips,
      props([detail('w', PersonDetailKind.Work, 'Intel'), detail('e', PersonDetailKind.Email, 'e@example.com')]),
    );

    expect(screen.getByText('Intel')).toBeInTheDocument();
    expect(screen.queryByText('e@example.com')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'contact_field_email: e@example.com' })).toBeInTheDocument();
  });

  it('shows the first of several current values and counts the rest', () => {
    render(
      PersonContactChips,
      props([
        detail('h1', PersonDetailKind.Home, 'Rathmines'),
        detail('h2', PersonDetailKind.Home, 'Galway'),
        detail('h3', PersonDetailKind.Home, 'Cork', { until: '2020-01-01' }),
      ]),
    );

    expect(screen.getByText('Rathmines')).toBeInTheDocument();
    expect(screen.queryByText('Galway')).not.toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('treats a kind with only Past values as empty', () => {
    render(PersonContactChips, props([detail('h', PersonDetailKind.Home, 'Cork', { until: '2020-01-01' })]));

    expect(screen.getByRole('button', { name: 'contact_field_add_home' })).toBeInTheDocument();
    expect(screen.queryByText('Cork')).not.toBeInTheDocument();
  });

  it('copies an email on click and opens its popover', async () => {
    const user = userEvent.setup();
    render(PersonContactChips, props([detail('e', PersonDetailKind.Email, 'e@example.com')]));

    await user.click(screen.getByRole('button', { name: 'contact_field_email: e@example.com' }));

    expect(copyToClipboard).toHaveBeenCalledWith('e@example.com');
    expect(screen.getByRole('dialog', { name: 'contact_field_email' })).toBeInTheDocument();
  });

  it('lists every current value in the popover, and ends or edits from it', async () => {
    const user = userEvent.setup();
    const work = detail('w1', PersonDetailKind.Work, 'Intel', { since: '2019-03-01' });
    const handlers = props([work, detail('w2', PersonDetailKind.Work, 'Dell')]);
    render(PersonContactChips, handlers);

    await user.click(screen.getByRole('button', { name: 'contact_field_work: Intel' }));

    const dialog = screen.getByRole('dialog', { name: 'contact_field_work' });
    expect(dialog).toHaveTextContent('Intel');
    expect(dialog).toHaveTextContent('Dell');
    expect(dialog).toHaveTextContent('detail_since');
    expect(copyToClipboard).not.toHaveBeenCalled();

    await user.click(screen.getAllByRole('button', { name: 'detail_end' })[0]);
    expect(handlers.onEnd).toHaveBeenCalledWith(work);

    await user.click(screen.getByRole('button', { name: 'edit' }));
    expect(handlers.onEdit).toHaveBeenCalledWith(PersonDetailKind.Work);
  });
});
