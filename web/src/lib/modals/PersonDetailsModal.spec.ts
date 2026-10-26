import PersonDetailsModal from '$lib/modals/PersonDetailsModal.svelte';
import {
  addPersonDetails,
  getPersonDetailConflicts,
  getPersonDetailKeys,
  getPersonDetailValues,
  PersonDetailDatePrecision,
  updatePersonDetails,
  type PersonResponseDto,
} from '@immich/sdk';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';
import { DateTime } from 'luxon';

// Partial, because the modal now reaches the thumbnail helpers and those pull in enough of the SDK
// that replacing the whole module leaves the store layer without the constants it reads at import.
vi.mock('@immich/sdk', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@immich/sdk')>()),
  addPersonDetails: vi.fn().mockResolvedValue(undefined),
  getPersonDetailConflicts: vi.fn().mockResolvedValue([]),
  getPersonDetailKeys: vi.fn().mockResolvedValue([]),
  getPersonDetailValues: vi.fn().mockResolvedValue([]),
  updatePersonDetails: vi.fn().mockResolvedValue([]),
}));

const detail = (
  id: string,
  key: string,
  value: string,
  subdetails: { id: string; key: string; value: string }[] = [],
) => ({
  id,
  key,
  value,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  subdetails: subdetails.map((sub, index) => ({ ...sub, sortOrder: index })),
  since: null,
  sincePrecision: null,
  until: null,
  untilPrecision: null,
  alongWith: { current: { total: 0, people: [] }, past: { total: 0, people: [] } },
});

const person = (id: string, name: string) => ({ id, name }) as PersonResponseDto;

describe('PersonDetailsModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('opens on an empty row when the person has no details', () => {
    render(PersonDetailsModal, { personId: 'person-1', details: [], onClose: vi.fn() });

    expect(screen.queryAllByPlaceholderText('detail_key')).toHaveLength(1);
  });

  it('opens on the existing rows without adding a blank one', () => {
    const details = [detail('detail-1', 'Hometown', 'Cork')];
    render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

    expect(screen.queryAllByPlaceholderText('detail_key')).toHaveLength(1);
    expect(screen.getByDisplayValue('Hometown')).toBeDefined();
  });

  it('offers the values already recorded under the key on the row', async () => {
    vi.mocked(getPersonDetailValues).mockResolvedValue([{ value: 'University College Cork', count: 3 }]);
    const details = [detail('detail-1', 'College', '')];
    render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

    await userEvent.click(screen.getByPlaceholderText('detail_value'));

    await waitFor(() =>
      expect(getPersonDetailValues).toHaveBeenCalledWith({ detailKey: 'College', term: '', parentKey: undefined }),
    );
    await waitFor(() => expect(screen.getByText('University College Cork')).toBeDefined());
  });

  it('adds a row when the add button is pressed', async () => {
    render(PersonDetailsModal, { personId: 'person-1', details: [], onClose: vi.fn() });

    await userEvent.click(screen.getByText('add_detail'));

    expect(screen.queryAllByPlaceholderText('detail_key')).toHaveLength(2);
  });

  it('picks a suggestion with the arrow keys and enter', async () => {
    vi.mocked(getPersonDetailValues).mockResolvedValue([
      { value: 'University College Cork', count: 3 },
      { value: 'University of Limerick', count: 1 },
    ]);
    const details = [detail('detail-1', 'College', '')];
    render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

    const value = screen.getByPlaceholderText('detail_value');
    await userEvent.click(value);
    await waitFor(() => expect(screen.getByText('University of Limerick')).toBeDefined());

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');

    expect(screen.getByDisplayValue('University of Limerick')).toBeDefined();
  });

  it('leaves enter alone until an arrow key has chosen something', async () => {
    vi.mocked(getPersonDetailValues).mockResolvedValue([{ value: 'University College Cork', count: 3 }]);
    const details = [detail('detail-1', 'College', 'Uni')];
    render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

    const value = screen.getByPlaceholderText('detail_value');
    await userEvent.click(value);
    await waitFor(() => expect(screen.getByText('University College Cork')).toBeDefined());

    await userEvent.keyboard('{Enter}');

    expect(screen.getByDisplayValue('Uni')).toBeDefined();
  });

  it('scopes a subdetail key to the detail it hangs from', async () => {
    const details = [detail('detail-1', 'Secondary School', "St. Augustine's")];
    render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

    await userEvent.click(screen.getByLabelText('add_subdetail'));
    await userEvent.click(screen.getByPlaceholderText('detail_subdetail_key'));

    await waitFor(() => expect(getPersonDetailKeys).toHaveBeenCalledWith({ term: '', parentKey: 'Secondary School' }));
  });

  it('opens on the subdetails a detail already carries', () => {
    const details = [
      detail('detail-1', 'Secondary School', "St. Augustine's", [{ id: 'sub-1', key: 'Class of', value: '2016' }]),
    ];
    render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

    expect(screen.getByDisplayValue('Class of')).toBeDefined();
    expect(screen.getByDisplayValue('2016')).toBeDefined();
  });

  it('reports who already records a typed key when adding to several people', async () => {
    vi.mocked(getPersonDetailConflicts).mockResolvedValue([
      { key: 'hometown', people: [{ id: 'person-2', name: 'Tom', value: 'Dublin' }] },
    ]);

    render(PersonDetailsModal, { people: [person('person-1', 'Amy'), person('person-2', 'Tom')], onClose: vi.fn() });

    await userEvent.type(screen.getByPlaceholderText('detail_key'), 'Hometown');
    await userEvent.type(screen.getByPlaceholderText('detail_value'), 'Cork');

    await waitFor(() => expect(screen.getByText('detail_conflicts')).toBeDefined());
    expect(screen.getByLabelText(/Tom/)).toBeDefined();
  });

  it('appends to everyone until a conflicting face is turned over to replacing', async () => {
    vi.mocked(getPersonDetailConflicts).mockResolvedValue([
      { key: 'hometown', people: [{ id: 'person-2', name: 'Tom', value: 'Dublin' }] },
    ]);

    render(PersonDetailsModal, { people: [person('person-1', 'Amy'), person('person-2', 'Tom')], onClose: vi.fn() });

    await userEvent.type(screen.getByPlaceholderText('detail_key'), 'Hometown');
    await userEvent.type(screen.getByPlaceholderText('detail_value'), 'Cork');
    await waitFor(() => expect(screen.getByText('detail_conflicts')).toBeDefined());

    await userEvent.click(screen.getByLabelText(/Tom/));
    await userEvent.click(screen.getByText('apply'));

    await waitFor(() =>
      expect(addPersonDetails).toHaveBeenCalledWith({
        personDetailsBulkAddDto: {
          personIds: ['person-1', 'person-2'],
          details: [
            {
              id: undefined,
              key: 'Hometown',
              value: 'Cork',
              subdetails: [],
              replaceForPersonIds: ['person-2'],
              archiveReplaced: true,
            },
          ],
        },
      }),
    );
  });

  it('sends the choice to overwrite rather than archive with a bulk row that replaces someone', async () => {
    vi.mocked(getPersonDetailConflicts).mockResolvedValue([
      { key: 'hometown', people: [{ id: 'person-2', name: 'Tom', value: 'Dublin' }] },
    ]);

    render(PersonDetailsModal, { people: [person('person-1', 'Amy'), person('person-2', 'Tom')], onClose: vi.fn() });

    await userEvent.type(screen.getByPlaceholderText('detail_key'), 'Hometown');
    await userEvent.type(screen.getByPlaceholderText('detail_value'), 'Cork');
    await waitFor(() => expect(screen.getByText('detail_conflicts')).toBeDefined());

    // Nothing is being overwritten yet, so there is nothing to keep.
    expect(screen.queryByLabelText('detail_archive_old_bulk')).toBeNull();

    await userEvent.click(screen.getByLabelText(/Tom/));
    await userEvent.click(screen.getByLabelText('detail_archive_old_bulk'));
    await userEvent.click(screen.getByText('apply'));

    await waitFor(() => expect(addPersonDetails).toHaveBeenCalled());
    expect(vi.mocked(addPersonDetails).mock.calls[0][0].personDetailsBulkAddDto.details[0]).toMatchObject({
      replaceForPersonIds: ['person-2'],
      archiveReplaced: false,
    });
  });

  it('sends no archive flag on a bulk row that replaces nobody', async () => {
    render(PersonDetailsModal, { people: [person('person-1', 'Amy')], onClose: vi.fn() });

    await userEvent.type(screen.getByPlaceholderText('detail_key'), 'Hometown');
    await userEvent.type(screen.getByPlaceholderText('detail_value'), 'Cork');
    await userEvent.click(screen.getByText('apply'));

    await waitFor(() => expect(addPersonDetails).toHaveBeenCalled());
    expect(vi.mocked(addPersonDetails).mock.calls[0][0].personDetailsBulkAddDto.details[0]).not.toHaveProperty(
      'archiveReplaced',
    );
  });

  describe('Current and Past', () => {
    const thisMonth = () => DateTime.now().startOf('month').toISODate();
    const undated = { since: null, sincePrecision: null, until: null, untilPrecision: null };

    const saved = () => vi.mocked(updatePersonDetails).mock.calls[0][0].personDetailsUpdateDto.details;

    it('moves the old value to Past with its subdetails when the value is changed', async () => {
      const details = [
        {
          ...detail('detail-1', 'Works at', 'Intel', [{ id: 'sub-1', key: 'Role', value: 'Engineer' }]),
          since: '2019-03-01',
          sincePrecision: PersonDetailDatePrecision.Month,
        },
      ];
      render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

      const value = screen.getByDisplayValue('Intel');
      await userEvent.clear(value);
      await userEvent.type(value, 'Google');

      expect(screen.getByLabelText('detail_archive_old')).toBeDefined();

      await userEvent.click(screen.getByText('save'));

      await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
      expect(saved()).toEqual([
        { id: undefined, key: 'Works at', value: 'Google', subdetails: [], ...undated },
        {
          id: 'detail-1',
          key: 'Works at',
          value: 'Intel',
          subdetails: [{ id: 'sub-1', key: 'Role', value: 'Engineer' }],
          since: '2019-03-01',
          sincePrecision: 'month',
          until: thisMonth(),
          untilPrecision: 'month',
        },
      ]);
    });

    it('updates in place when moving the old value is unticked', async () => {
      render(PersonDetailsModal, {
        personId: 'person-1',
        details: [detail('detail-1', 'Works at', 'Intel')],
        onClose: vi.fn(),
      });

      const value = screen.getByDisplayValue('Intel');
      await userEvent.clear(value);
      await userEvent.type(value, 'Google');
      await userEvent.click(screen.getByLabelText('detail_archive_old'));
      await userEvent.click(screen.getByText('save'));

      await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
      expect(saved()).toEqual([{ id: 'detail-1', key: 'Works at', value: 'Google', subdetails: [], ...undated }]);
    });

    it('offers nothing for a changed key, or once the value is put back', async () => {
      render(PersonDetailsModal, {
        personId: 'person-1',
        details: [detail('detail-1', 'Works at', 'Intel')],
        onClose: vi.fn(),
      });

      const key = screen.getByDisplayValue('Works at');
      await userEvent.clear(key);
      await userEvent.type(key, 'Employer');
      expect(screen.queryByLabelText('detail_archive_old')).toBeNull();

      const value = screen.getByDisplayValue('Intel');
      await userEvent.type(value, 'x');
      expect(screen.getByLabelText('detail_archive_old')).toBeDefined();

      await userEvent.type(value, '{Backspace}');
      expect(screen.queryByLabelText('detail_archive_old')).toBeNull();
    });

    it('ends a current detail this month and moves it to Past', async () => {
      render(PersonDetailsModal, {
        personId: 'person-1',
        details: [detail('detail-1', 'Works at', 'Intel'), detail('detail-2', 'Hometown', 'Cork')],
        onClose: vi.fn(),
      });

      expect(screen.queryByRole('tablist')).toBeNull();

      await userEvent.click(screen.getAllByText('detail_end')[0]);

      // Gone from Current, and the Past tab is there to find it under.
      expect(screen.queryByDisplayValue('Intel')).toBeNull();
      await userEvent.click(screen.getByRole('tab', { name: 'details_past' }));
      expect(screen.getByDisplayValue('Intel')).toBeDefined();

      await userEvent.click(screen.getByText('save'));

      await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
      expect(saved()[0]).toMatchObject({ id: 'detail-1', until: thisMonth(), untilPrecision: 'month' });
      expect(saved()[1]).toMatchObject({ id: 'detail-2', until: null });
    });

    it('restores a past detail to Current', async () => {
      const details = [
        detail('detail-1', 'Hometown', 'Cork'),
        {
          ...detail('detail-2', 'Works at', 'Intel'),
          until: '2024-05-01',
          untilPrecision: PersonDetailDatePrecision.Month,
        },
      ];
      render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

      expect(screen.queryByDisplayValue('Intel')).toBeNull();
      await userEvent.click(screen.getByRole('tab', { name: 'details_past' }));
      await userEvent.click(screen.getByText('restore'));

      // The last Past row going takes the tabs with it, back onto Current.
      expect(screen.queryByRole('tablist')).toBeNull();
      expect(screen.getByDisplayValue('Intel')).toBeDefined();

      await userEvent.click(screen.getByText('save'));

      await waitFor(() => expect(updatePersonDetails).toHaveBeenCalled());
      expect(saved()[1]).toMatchObject({ id: 'detail-2', until: null, untilPrecision: null });
    });

    it('records a year on its own at year precision, and clears it again', async () => {
      render(PersonDetailsModal, {
        personId: 'person-1',
        details: [detail('detail-1', 'Works at', 'Intel')],
        onClose: vi.fn(),
      });

      const year = screen.getByLabelText('detail_date_year');
      await userEvent.type(year, '2019');
      await userEvent.click(screen.getByText('save'));

      await waitFor(() => expect(updatePersonDetails).toHaveBeenCalledTimes(1));
      expect(saved()[0]).toMatchObject({ since: '2019-01-01', sincePrecision: 'year' });

      await userEvent.clear(year);
      await userEvent.click(screen.getByText('save'));

      await waitFor(() => expect(updatePersonDetails).toHaveBeenCalledTimes(2));
      expect(vi.mocked(updatePersonDetails).mock.calls[1][0].personDetailsUpdateDto.details[0]).toMatchObject({
        since: null,
        sincePrecision: null,
      });
    });

    it('refuses to save an Until before the Since', async () => {
      const details = [
        detail('detail-1', 'Hometown', 'Cork'),
        {
          ...detail('detail-2', 'Works at', 'Intel'),
          until: '2018-01-01',
          untilPrecision: PersonDetailDatePrecision.Year,
        },
      ];
      render(PersonDetailsModal, { personId: 'person-1', details, onClose: vi.fn() });

      await userEvent.click(screen.getByRole('tab', { name: 'details_past' }));
      await userEvent.type(screen.getAllByLabelText('detail_date_year')[0], '2019');

      expect(screen.getByText('detail_until_before_since')).toBeDefined();
      expect((screen.getByText('save') as HTMLButtonElement).closest('button')!.disabled).toBe(true);
    });
  });
});
