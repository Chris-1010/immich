import PersonDetailsBox from '$lib/components/faces-page/person-details-box.svelte';
import type { AlongWithPersonResponseDto, PersonDetailResponseDto } from '@immich/sdk';
import { render, screen } from '@testing-library/svelte';
import userEvent from '@testing-library/user-event';

const face = (id: string) =>
  ({ id, name: id, sharedKeys: [], sharedSubdetails: [] }) as unknown as AlongWithPersonResponseDto;

const detail = (
  id: string,
  value: string,
  overrides: Partial<PersonDetailResponseDto> = {},
): PersonDetailResponseDto => ({
  id,
  key: 'Works at',
  value,
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  since: null,
  sincePrecision: null,
  until: null,
  untilPrecision: null,
  subdetails: [],
  alongWith: { current: { total: 0, people: [] }, past: { total: 0, people: [] } },
  ...overrides,
});

describe('PersonDetailsBox', () => {
  it('offers the empty-state button only when there are no details at all', () => {
    render(PersonDetailsBox, { details: [], onEdit: vi.fn() });

    expect(screen.getByText('add_details')).toBeInTheDocument();
  });

  it('hides the toggle while nothing is Past', () => {
    render(PersonDetailsBox, { details: [detail('a', 'Intel')], onEdit: vi.fn() });

    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.getByText('Intel')).toBeInTheDocument();
  });

  it('shows Current by default and Past on request', async () => {
    const user = userEvent.setup();
    render(PersonDetailsBox, {
      details: [detail('a', 'Intel'), detail('b', 'Dell', { until: '2020-01-01' })],
      onEdit: vi.fn(),
    });

    expect(screen.getByText('Intel')).toBeInTheDocument();
    expect(screen.queryByText('Dell')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'details_past' }));

    expect(screen.getByText('Dell')).toBeInTheDocument();
    expect(screen.queryByText('Intel')).not.toBeInTheDocument();
  });

  it('falls back to Current once the last Past detail is gone', async () => {
    const user = userEvent.setup();
    const { rerender } = render(PersonDetailsBox, {
      details: [detail('a', 'Intel'), detail('b', 'Dell', { until: '2020-01-01' })],
      onEdit: vi.fn(),
    });

    await user.click(screen.getByRole('tab', { name: 'details_past' }));
    await rerender({ details: [detail('a', 'Intel')] });

    expect(screen.getByText('Intel')).toBeInTheDocument();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('counts only current holders on a current row, and everyone on a past row', async () => {
    const user = userEvent.setup();
    const alongWith = {
      current: { total: 4, people: ['c1', 'c2', 'c3', 'c4'].map((id) => face(id)) },
      past: { total: 2, people: ['p1', 'p2'].map((id) => face(id)) },
    };
    render(PersonDetailsBox, {
      details: [detail('a', 'Intel', { alongWith }), detail('b', 'Dell', { until: '2020-01-01', alongWith })],
      onEdit: vi.fn(),
    });

    expect(screen.getByText('+1')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'details_past' }));

    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('still reaches past holders from a current row with no +N', async () => {
    const user = userEvent.setup();
    const alongWith = {
      current: { total: 1, people: [face('c1')] },
      past: { total: 2, people: ['p1', 'p2'].map((id) => face(id)) },
    };
    render(PersonDetailsBox, { details: [detail('a', 'Intel', { alongWith })], onEdit: vi.fn() });

    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /along_with_past_count/ }));

    expect(screen.getByText('along_with_previously')).toBeInTheDocument();
  });

  it('offers no trigger when everyone is already shown', () => {
    const alongWith = { current: { total: 2, people: [face('c1'), face('c2')] }, past: { total: 0, people: [] } };
    render(PersonDetailsBox, { details: [detail('a', 'Intel', { alongWith })], onEdit: vi.fn() });

    expect(screen.queryByRole('button', { name: /along_with/ })).not.toBeInTheDocument();
  });
});
