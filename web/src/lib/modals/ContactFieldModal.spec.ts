import ContactFieldModal from '$lib/modals/ContactFieldModal.svelte';
import {
  getPersonDetailValues,
  PersonDetailDatePrecision,
  PersonDetailKind,
  updatePersonDetails,
  type PersonDetailResponseDto,
} from '@immich/sdk';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';

vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  getPersonDetailValues: vi.fn().mockResolvedValue([]),
  updatePersonDetails: vi.fn().mockResolvedValue([]),
}));

const detail = (
  id: string,
  kind: PersonDetailKind | null,
  key: string,
  value: string,
  overrides: Partial<PersonDetailResponseDto> = {},
): PersonDetailResponseDto => ({
  id,
  key,
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

const thisMonth = () => DateTime.now().startOf('month').toISODate();
const saved = () => vi.mocked(updatePersonDetails).mock.calls[0][0].personDetailsUpdateDto.details;

/** Everything a person might hold besides their Home, each with something that would be lost on a sloppy round trip. */
const others = [
  detail('free', null, 'Hometown', 'Cork', {
    since: '2001-01-01',
    sincePrecision: PersonDetailDatePrecision.Year,
    subdetails: [{ id: 'sub-1', key: 'County', value: 'Cork', sortOrder: 0 }],
  }),
  detail('work', PersonDetailKind.Work, 'Work', 'Intel', { latitude: 53.3, longitude: -6.2 }),
  detail('old-home', PersonDetailKind.Home, 'Home', 'Galway', {
    since: '2010-01-01',
    sincePrecision: PersonDetailDatePrecision.Year,
    until: '2015-06-01',
    untilPrecision: PersonDetailDatePrecision.Month,
  }),
];

const othersAsSent = [
  {
    id: 'free',
    key: 'Hometown',
    value: 'Cork',
    kind: null,
    latitude: null,
    longitude: null,
    since: '2001-01-01',
    sincePrecision: 'year',
    until: null,
    untilPrecision: null,
    subdetails: [{ id: 'sub-1', key: 'County', value: 'Cork' }],
  },
  {
    id: 'work',
    key: 'Work',
    value: 'Intel',
    kind: 'work',
    latitude: 53.3,
    longitude: -6.2,
    since: null,
    sincePrecision: null,
    until: null,
    untilPrecision: null,
    subdetails: [],
  },
  {
    id: 'old-home',
    key: 'Home',
    value: 'Galway',
    kind: 'home',
    latitude: null,
    longitude: null,
    since: '2010-01-01',
    sincePrecision: 'year',
    until: '2015-06-01',
    untilPrecision: 'month',
    subdetails: [],
  },
];

describe('ContactFieldModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens on a blank row when the kind holds nothing Current', () => {
    render(ContactFieldModal, { personId: 'p', kind: PersonDetailKind.Home, details: others, onClose: vi.fn() });

    expect(screen.getAllByLabelText('contact_field_home')).toHaveLength(1);
    expect(screen.getByLabelText('contact_field_home')).toHaveValue('');
  });

  it('adds a new value under the localized kind name and sends everything else back untouched', async () => {
    render(ContactFieldModal, { personId: 'p', kind: PersonDetailKind.Home, details: others, onClose: vi.fn() });

    await userEvent.type(screen.getByLabelText('contact_field_home'), 'Rathmines');
    await userEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
    expect(saved()).toEqual([
      ...othersAsSent,
      {
        id: undefined,
        key: 'contact_field_home',
        value: 'Rathmines',
        kind: 'home',
        latitude: null,
        longitude: null,
        since: null,
        sincePrecision: null,
        until: null,
        untilPrecision: null,
        subdetails: [],
      },
    ]);
  });

  it('looks values up by kind', async () => {
    render(ContactFieldModal, { personId: 'p', kind: PersonDetailKind.Work, details: [], onClose: vi.fn() });

    await userEvent.type(screen.getByLabelText('contact_field_work'), 'In');

    await waitFor(() => expect(getPersonDetailValues).toHaveBeenCalledWith({ kind: 'work', term: 'In' }));
  });

  it('moves the old value to Past with its subdetails and pin when the value changes', async () => {
    const home = detail('home', PersonDetailKind.Home, 'Home', 'Rathmines', {
      since: '2019-03-01',
      sincePrecision: PersonDetailDatePrecision.Month,
      latitude: 53.32,
      longitude: -6.26,
      subdetails: [{ id: 'sub-2', key: 'Flat', value: '4', sortOrder: 0 }],
    });
    render(ContactFieldModal, {
      personId: 'p',
      kind: PersonDetailKind.Home,
      details: [others[0], home, ...others.slice(1)],
      onClose: vi.fn(),
    });

    const value = screen.getByDisplayValue('Rathmines');
    await userEvent.clear(value);
    await userEvent.type(value, 'Ranelagh');
    expect(screen.getByLabelText('detail_archive_old')).toBeChecked();

    await userEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
    expect(saved()).toEqual([
      othersAsSent[0],
      {
        id: undefined,
        key: 'Home',
        value: 'Ranelagh',
        kind: 'home',
        latitude: null,
        longitude: null,
        since: null,
        sincePrecision: null,
        until: null,
        untilPrecision: null,
        subdetails: [],
      },
      {
        id: 'home',
        key: 'Home',
        value: 'Rathmines',
        kind: 'home',
        latitude: 53.32,
        longitude: -6.26,
        since: '2019-03-01',
        sincePrecision: 'month',
        until: thisMonth(),
        untilPrecision: 'month',
        subdetails: [{ id: 'sub-2', key: 'Flat', value: '4' }],
      },
      ...othersAsSent.slice(1),
    ]);
  });

  it('updates in place when moving the old value is unticked', async () => {
    const email = detail('email', PersonDetailKind.Email, 'Email', 'a@example.com');
    render(ContactFieldModal, { personId: 'p', kind: PersonDetailKind.Email, details: [email], onClose: vi.fn() });

    const value = screen.getByDisplayValue('a@example.com');
    await userEvent.clear(value);
    await userEvent.type(value, 'b@example.com');
    await userEvent.click(screen.getByLabelText('detail_archive_old'));
    await userEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
    expect(saved()).toEqual([expect.objectContaining({ id: 'email', value: 'b@example.com', until: null })]);
  });

  it('ends a value this month and keeps a second one Current', async () => {
    const phones = [
      detail('p1', PersonDetailKind.Phone, 'Phone', '111'),
      detail('p2', PersonDetailKind.Phone, 'Phone', '222'),
    ];
    render(ContactFieldModal, { personId: 'p', kind: PersonDetailKind.Phone, details: phones, onClose: vi.fn() });

    await userEvent.click(screen.getAllByText('detail_end')[0]);
    expect(screen.getByText('contact_field_ended')).toBeInTheDocument();

    await userEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
    expect(saved()).toEqual([
      expect.objectContaining({ id: 'p1', value: '111', until: thisMonth(), untilPrecision: 'month' }),
      expect.objectContaining({ id: 'p2', value: '222', until: null }),
    ]);
  });

  it('adds another value of the same kind', async () => {
    const work = detail('work', PersonDetailKind.Work, 'Work', 'Intel');
    render(ContactFieldModal, { personId: 'p', kind: PersonDetailKind.Work, details: [work], onClose: vi.fn() });

    await userEvent.click(screen.getByText('contact_field_add_another'));
    await userEvent.type(screen.getAllByLabelText('contact_field_work')[1], 'Dell');
    await userEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
    expect(saved()).toEqual([
      expect.objectContaining({ id: 'work', value: 'Intel', kind: 'work' }),
      expect.objectContaining({ id: undefined, key: 'contact_field_work', value: 'Dell', kind: 'work' }),
    ]);
  });

  it('offers no pin without a picker, and applies the one a picker returns', async () => {
    const { unmount } = render(ContactFieldModal, {
      personId: 'p',
      kind: PersonDetailKind.Home,
      details: [],
      onClose: vi.fn(),
    });
    expect(screen.queryByText('contact_field_set_pin')).not.toBeInTheDocument();
    unmount();

    const onSetPin = vi.fn().mockResolvedValue({ latitude: 1, longitude: 2, name: 'Rathmines' });
    render(ContactFieldModal, { personId: 'p', kind: PersonDetailKind.Home, details: [], onSetPin, onClose: vi.fn() });

    await userEvent.click(screen.getByText('contact_field_set_pin'));
    expect(screen.getByLabelText('contact_field_home')).toHaveValue('Rathmines');

    await userEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
    expect(saved()).toEqual([expect.objectContaining({ value: 'Rathmines', latitude: 1, longitude: 2 })]);
  });

  it('names a pin into a blank value only, never over typed text', async () => {
    const onSetPin = vi.fn().mockResolvedValue({ latitude: 1, longitude: 2, name: 'Dublin, Ireland' });
    render(ContactFieldModal, { personId: 'p', kind: PersonDetailKind.Home, details: [], onSetPin, onClose: vi.fn() });

    await userEvent.type(screen.getByLabelText('contact_field_home'), 'Granny flat');
    await userEvent.click(screen.getByText('contact_field_set_pin'));

    expect(screen.getByLabelText('contact_field_home')).toHaveValue('Granny flat');
    await userEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
    expect(saved()).toEqual([expect.objectContaining({ value: 'Granny flat', latitude: 1, longitude: 2 })]);
  });

  it('offers no pin on Email or Phone', () => {
    render(ContactFieldModal, {
      personId: 'p',
      kind: PersonDetailKind.Email,
      details: [],
      onSetPin: vi.fn(),
      onClose: vi.fn(),
    });
    expect(screen.queryByText('contact_field_set_pin')).not.toBeInTheDocument();
  });

  it('moves or removes an existing pin, keeping the value', async () => {
    render(ContactFieldModal, {
      personId: 'p',
      kind: PersonDetailKind.Work,
      details: [...others],
      onSetPin: vi.fn(),
      onClose: vi.fn(),
    });
    expect(screen.getByText('contact_field_move_pin')).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('contact_field_remove_pin'));
    expect(screen.getByText('contact_field_set_pin')).toBeInTheDocument();
    await userEvent.click(screen.getByText('save'));

    await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
    expect(saved()).toContainEqual(
      expect.objectContaining({ id: 'work', value: 'Intel', latitude: null, longitude: null }),
    );
  });
});
