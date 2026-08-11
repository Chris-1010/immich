import PersonDetailsModal from '$lib/modals/PersonDetailsModal.svelte';
import {
  addPersonDetails,
  getPersonDetailConflicts,
  getPersonDetailKeys,
  getPersonDetailValues,
  type PersonResponseDto,
} from '@immich/sdk';
import { render, screen, waitFor } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

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
  alongWith: { total: 0, people: [] },
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
            { id: undefined, key: 'Hometown', value: 'Cork', subdetails: [], replaceForPersonIds: ['person-2'] },
          ],
        },
      }),
    );
  });
});
