import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── vi.mock calls must appear before all other imports ────────────────────────

const mockNavigate = vi.fn();

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string, _p?: unknown) => k }),
}));
vi.mock('framer-motion', () => ({
  motion: {
    div: (p: React.ComponentProps<'div'>) => React.createElement('div', p),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({
    title,
    actions,
  }: {
    title: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
}));
vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
    value,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
  }) => (
    <div data-testid="select" data-value={value}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => (
    <span>{placeholder ?? ''}</span>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <button data-value={value}>{children}</button>,
}));

// ── Component + API imports (after mocks) ─────────────────────────────────────
import { useApi } from '../../hooks/useApi';
import { ContactSegmentsPage } from '../../pages/ContactSegmentsPage';
import { ROUTES } from '../../constants/routes';
import type { ContactSegment } from '../../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const segment1: ContactSegment = {
  id: 'seg1',
  name: 'Acme Corp',
  description: 'All Acme contacts',
  color: '#2a4bd9',
  is_dynamic: true,
  filter_def: { logic: 'AND', conditions: [] },
  contact_count: 3,
  last_evaluated_at: '2026-06-20T10:00:00Z',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-20T10:00:00Z',
};

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listSegments: vi.fn().mockResolvedValue([]),
    createSegment: vi.fn().mockResolvedValue({}),
    updateSegment: vi.fn().mockResolvedValue({}),
    deleteSegment: vi.fn().mockResolvedValue({}),
    refreshSegment: vi.fn().mockResolvedValue({ contact_count: 3 }),
    previewSegment: vi.fn().mockResolvedValue({ count: 5, preview: [] }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ContactSegmentsPage — segment list', () => {
  it('renders segment name and dynamic/count badges', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listSegments: vi.fn().mockResolvedValue([segment1]),
      }) as unknown as ReturnType<typeof useApi>,
    );

    render(<MemoryRouter><ContactSegmentsPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());
    // Badge text: t('contactSegments.dynamic') → returns the key as-is
    expect(screen.getByText('contactSegments.dynamic')).toBeInTheDocument();
    // Badge text: t('contactSegments.contactCount', { count: '3' }) → returns key as-is
    expect(screen.getByText('contactSegments.contactCount')).toBeInTheDocument();
  });
});

describe('ContactSegmentsPage — delete segment', () => {
  it('opens delete dialog and calls deleteSegment on confirm, then removes segment', async () => {
    const deleteSegment = vi.fn().mockResolvedValue({});
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listSegments: vi.fn().mockResolvedValue([segment1]),
        deleteSegment,
      }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(<MemoryRouter><ContactSegmentsPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    // The delete ghost button in SegmentCard wraps <Icon name="delete" />
    const allButtons = screen.getAllByRole('button');
    const cardDeleteBtn = allButtons.find(
      (btn) => btn.querySelector('[data-icon="delete"]'),
    );
    expect(cardDeleteBtn).toBeDefined();
    await user.click(cardDeleteBtn!);

    // Delete dialog opens — DialogTitle is hardcoded "Delete Segment"
    await waitFor(() =>
      expect(screen.getByText('Delete Segment')).toBeInTheDocument(),
    );

    // The destructive confirm button contains "Delete" text (after icon)
    // Its textContent is the icon span + "Delete" text node
    const confirmBtn = screen.getAllByRole('button').find(
      (btn) =>
        btn.textContent?.includes('Delete') &&
        btn.getAttribute('class')?.includes('destructive'),
    );
    expect(confirmBtn).toBeDefined();
    await user.click(confirmBtn!);

    await waitFor(() => expect(deleteSegment).toHaveBeenCalledWith('seg1'));
    await waitFor(() =>
      expect(screen.queryByText('Acme Corp')).not.toBeInTheDocument(),
    );
  });
});

describe('ContactSegmentsPage — View Members navigation', () => {
  it('navigates to ROUTES.CONTACTS when View Members button is clicked', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listSegments: vi.fn().mockResolvedValue([segment1]),
      }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(<MemoryRouter><ContactSegmentsPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    // Button text is t('contactSegments.viewMembers') = the key itself
    const viewMembersBtn = screen.getByRole('button', {
      name: /contactSegments\.viewMembers/i,
    });
    await user.click(viewMembersBtn);

    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.CONTACTS);
  });
});

describe('ContactSegmentsPage — empty state', () => {
  it('shows noSegments text when there are no segments', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listSegments: vi.fn().mockResolvedValue([]),
      }) as unknown as ReturnType<typeof useApi>,
    );

    render(<MemoryRouter><ContactSegmentsPage /></MemoryRouter>);

    await waitFor(() =>
      expect(
        screen.getByText('contactSegments.noSegments'),
      ).toBeInTheDocument(),
    );
  });
});

describe('ContactSegmentsPage — New Segment sheet', () => {
  it('opens the SegmentBuilder sheet when New Segment is clicked', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listSegments: vi.fn().mockResolvedValue([]),
      }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(<MemoryRouter><ContactSegmentsPage /></MemoryRouter>);

    await waitFor(() =>
      expect(screen.getByText('contactSegments.noSegments')).toBeInTheDocument(),
    );

    // Buttons with "contactSegments.newSegment" text — header action + empty state CTA
    const newSegmentButtons = screen.getAllByRole('button').filter((btn) =>
      btn.textContent?.includes('contactSegments.newSegment'),
    );
    expect(newSegmentButtons.length).toBeGreaterThanOrEqual(1);
    // Click the header action (first occurrence)
    await user.click(newSegmentButtons[0]);

    // SheetTitle renders t('contactSegments.newSegment') = key; check it appears in a heading
    await waitFor(() => {
      const matches = screen.queryAllByText('contactSegments.newSegment');
      expect(matches.length).toBeGreaterThanOrEqual(2); // button + SheetTitle
    });
  });
});
