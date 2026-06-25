import React from 'react';
import { describe, it, expect, afterEach, vi, beforeEach } from 'vitest';

// ── mocks must appear before any component imports ────────────────────────────
vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../lib/i18n', () => ({ useTranslation: () => ({ t: (k: string) => k }) }));
vi.mock('framer-motion', () => ({
  motion: { div: (p: any) => React.createElement('div', p) },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ title, actions }: any) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
}));
vi.mock('../../components/Icon', () => ({ Icon: ({ name }: any) => <span data-icon={name} /> }));
vi.mock('../../lib/dataBus', () => ({ useInvalidation: vi.fn() }));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock('@/components/ui/select', () => ({
  Select: ({ onValueChange, children }: any) => (
    <div data-testid="select" onClick={() => onValueChange?.('high')}>{children}</div>
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
import { CasesPage } from '../../pages/CasesPage';
import type { CxCase } from '../../types';

// ── fixtures ──────────────────────────────────────────────────────────────────
const cxCase: CxCase = {
  id: 'c1',
  title: 'NPS Detractor',
  status: 'open',
  severity: 'high',
  contact: { name: 'Alice Johnson', email: 'alice@example.com' },
  contact_id: 'contact-1',
  owner_label: null,
  driver_ref: null,
  resolve_due_at: new Date(Date.now() + 10 * 3600000).toISOString(),
  sla_breached: false,
  audit_log: [],
  description: null,
  external_refs: {},
  created_at: '2026-06-24T00:00:00Z',
};

const slaDashboard = {
  open_count: 1,
  at_risk_count: 0,
  breached_count: 0,
  by_severity: {},
};

function makeApi(overrides: Record<string, any> = {}) {
  return {
    listCases: vi.fn().mockResolvedValue({ cases: [cxCase] }),
    getSlaDashboard: vi.fn().mockResolvedValue(slaDashboard),
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
describe('CasesPage', () => {
  it('renders case list with case title and contact name', async () => {
    render(<MemoryRouter><CasesPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('NPS Detractor')).toBeInTheDocument());
    expect(screen.getByText('Alice Johnson')).toBeInTheDocument();
  });

  it('calls listCases with status param when status tab is clicked', async () => {
    const listCases = vi.fn().mockResolvedValue({ cases: [] });
    vi.mocked(useApi).mockReturnValue(
      makeApi({ listCases }) as unknown as ReturnType<typeof useApi>,
    );
    const user = userEvent.setup();

    render(<MemoryRouter><CasesPage /></MemoryRouter>);

    // Wait for initial load to settle
    await waitFor(() => expect(listCases).toHaveBeenCalled());

    // Click the "open" status tab — text is the translation key since t returns key
    const openTab = await screen.findByRole('button', { name: 'cases.status.open' });
    await user.click(openTab);

    await waitFor(() =>
      expect(listCases).toHaveBeenCalledWith(expect.objectContaining({ status: 'open' })),
    );
  });

  it('shows empty state when no cases returned', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({ listCases: vi.fn().mockResolvedValue({ cases: [] }) }) as unknown as ReturnType<typeof useApi>,
    );

    render(<MemoryRouter><CasesPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('cases.noCases')).toBeInTheDocument());
  });

  it('does not crash and shows empty state when listCases rejects', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listCases: vi.fn().mockRejectedValue(new Error('Network error')),
      }) as unknown as ReturnType<typeof useApi>,
    );

    render(<MemoryRouter><CasesPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('cases.noCases')).toBeInTheDocument());
  });

  it('renders the Create Case button', async () => {
    render(<MemoryRouter><CasesPage /></MemoryRouter>);

    // The button text comes from t('cases.createCase') which returns the key
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /cases\.createCase/i })).toBeInTheDocument(),
    );
  });
});
