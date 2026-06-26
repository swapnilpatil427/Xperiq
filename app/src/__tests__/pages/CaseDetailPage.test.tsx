import React from 'react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';

// ── mocks must appear before any component imports ────────────────────────────
vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, p?: any) => (p ? `${k}:${JSON.stringify(p)}` : k),
  }),
}));
vi.mock('framer-motion', () => ({
  motion: { div: (p: any) => React.createElement('div', p) },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ title }: any) => <h1>{title}</h1>,
}));
vi.mock('../../components/Icon', () => ({ Icon: ({ name }: any) => <span data-icon={name} /> }));
vi.mock('../../lib/dataBus', () => ({ invalidate: vi.fn(), useInvalidation: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => vi.fn(),
    useParams: () => ({ caseId: 'c1' }),
    Link: ({ to, children }: any) => <a href={to}>{children}</a>,
  };
});

vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children, disabled }: any) => (
    <div data-testid="status-select" data-disabled={disabled} onClick={() => onValueChange?.('in_progress')}>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: ({ placeholder }: any) => <span>{placeholder}</span>,
  SelectContent: ({ children }: any) => <div>{children}</div>,
  SelectItem: ({ value, children }: any) => (
    <button data-value={value} onClick={() => {}}>{children}</button>
  ),
}));

// ── imports after mocks ────────────────────────────────────────────────────────
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { useApi } from '../../hooks/useApi';
import { CaseDetailPage } from '../../pages/CaseDetailPage';
import type { CxCase } from '../../types';

// ── fixtures ──────────────────────────────────────────────────────────────────
const mockCase: CxCase = {
  id: 'c1',
  title: 'Detractor Follow-up',
  status: 'open',
  severity: 'high',
  contact: { name: 'Alice Johnson', email: 'alice@example.com' },
  contact_id: 'contact-1',
  owner_label: 'Bob Smith',
  driver_ref: null,
  resolve_due_at: new Date(Date.now() + 48 * 3600000).toISOString(),
  sla_breached: false,
  audit_log: [
    {
      action: 'status_change',
      from_status: null,
      to_status: 'open',
      actor: 'System',
      ts: '2026-06-24T00:00:00Z',
      note: null,
    },
  ],
  description: 'Customer gave NPS of 3',
  external_refs: {},
  created_at: '2026-06-24T00:00:00Z',
};

function makeApi(overrides: Record<string, any> = {}) {
  return {
    getCase: vi.fn().mockResolvedValue(mockCase),
    updateCase: vi.fn().mockResolvedValue(mockCase),
    addCaseEvent: vi.fn().mockResolvedValue([...mockCase.audit_log]),
    ...overrides,
  };
}

// ── setup / teardown ──────────────────────────────────────────────────────────
beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────
describe('CaseDetailPage', () => {
  it('renders case title, contact name, and severity badge', async () => {
    render(<MemoryRouter><CaseDetailPage /></MemoryRouter>);

    // Title appears in PageHeader (mocked as <h1>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Detractor Follow-up' })).toBeInTheDocument());

    // Contact name appears in the linked contact section
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();

    // Severity badge — t('cases.severity.high') returns the key
    expect(screen.getByText('cases.severity.high')).toBeInTheDocument();
  });

  it('adds a note when user types in textarea and clicks the add note button', async () => {
    const addCaseEvent = vi.fn().mockResolvedValue([...mockCase.audit_log]);
    vi.mocked(useApi).mockReturnValue(
      makeApi({ addCaseEvent }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(<MemoryRouter><CaseDetailPage /></MemoryRouter>);

    // Wait for case to load (title appears)
    await waitFor(() => screen.getByRole('heading', { name: 'Detractor Follow-up' }));

    // Find the note textarea by its placeholder key
    const textarea = screen.getByPlaceholderText('cases.notePlaceholder');
    await user.type(textarea, 'Test note');

    // Click the add note button
    const addNoteBtn = screen.getByRole('button', { name: /cases\.detail\.addNoteButton/i });
    await user.click(addNoteBtn);

    await waitFor(() =>
      expect(addCaseEvent).toHaveBeenCalledWith('c1', {
        action: 'note_added',
        note: 'Test note',
      }),
    );
  });

  it('assigns a new owner when user types in input and clicks check button', async () => {
    const updateCase = vi.fn().mockResolvedValue({ ...mockCase, owner_label: 'New Owner' });
    vi.mocked(useApi).mockReturnValue(
      makeApi({ updateCase }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(<MemoryRouter><CaseDetailPage /></MemoryRouter>);

    // Wait for case to load
    await waitFor(() => screen.getByRole('heading', { name: 'Detractor Follow-up' }));

    // Type into owner input
    const ownerInput = screen.getByPlaceholderText('cases.detail.ownerPlaceholder');
    await user.type(ownerInput, 'New Owner');

    // Click the check (confirm) button — it is an icon button next to the owner input
    // It is enabled only when newOwner.trim() is non-empty
    const checkButtons = screen.getAllByRole('button').filter((btn) => {
      const icon = btn.querySelector('[data-icon="check"]');
      return icon !== null;
    });
    expect(checkButtons.length).toBeGreaterThanOrEqual(1);
    await user.click(checkButtons[0]);

    await waitFor(() =>
      expect(updateCase).toHaveBeenCalledWith('c1', { owner_label: 'New Owner' }),
    );
  });

  it('renders error state when getCase rejects', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        getCase: vi.fn().mockRejectedValue(new Error('Not found')),
      }) as unknown as ReturnType<typeof useApi>,
    );

    render(<MemoryRouter><CaseDetailPage /></MemoryRouter>);

    // After failed load, cxCase is null and error state renders
    await waitFor(() => expect(screen.getByText('cases.noCases')).toBeInTheDocument());
  });

  it('renders status stepper showing current status key', async () => {
    render(<MemoryRouter><CaseDetailPage /></MemoryRouter>);

    // Wait for case to load
    await waitFor(() => screen.getByRole('heading', { name: 'Detractor Follow-up' }));

    // StatusStepper renders t(`cases.status.open`) for the 'open' step
    // Since t returns the key, we expect to see 'cases.status.open' in the DOM
    // (it appears at least once in the stepper and once in the status badge)
    const statusLabels = screen.getAllByText('cases.status.open');
    expect(statusLabels.length).toBeGreaterThanOrEqual(1);
  });
});
