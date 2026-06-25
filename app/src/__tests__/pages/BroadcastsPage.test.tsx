import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── mocks (before all component imports) ──────────────────────────────────────

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', rest, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));

vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

// ── imports after mocks ────────────────────────────────────────────────────────

import { useApi } from '../../hooks/useApi';
import { BroadcastsPage } from '../../pages/BroadcastsPage';

// ── fixtures ───────────────────────────────────────────────────────────────────

const pendingBroadcast = {
  id: 'b1',
  name: 'Q3 NPS',
  status: 'pending_approval' as const,
  channels: ['email'],
  created_at: '2026-06-24T10:00:00Z',
  created_by: 'u1',
  description: null,
  estimated_count: 100,
  org_id: 'o1',
  segment_id: null,
  contact_ids: null,
  workflow_id: 'w1',
  payload: {},
  approved_by: null,
  approved_at: null,
  rejected_by: null,
  rejected_at: null,
  rejection_reason: null,
  expires_at: '2026-06-30T10:00:00Z',
  sent_count: 0,
  delivered_count: 0,
  failed_count: 0,
  updated_at: '2026-06-24T10:00:00Z',
};

const defaultStats = {
  pending: 1,
  approved: 0,
  sent: 0,
  rejected: 0,
  sending: 0,
  failed: 0,
  expired: 0,
};

const emptyStats = {
  pending: 0,
  approved: 0,
  sent: 0,
  rejected: 0,
  sending: 0,
  failed: 0,
  expired: 0,
};

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMockGet(broadcasts: unknown[], stats: unknown) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/stats')) return Promise.resolve({ data: stats });
    return Promise.resolve({ data: { broadcasts } });
  });
}

function makeMockApi(overrides: Record<string, unknown> = {}) {
  return {
    get: makeMockGet([pendingBroadcast], defaultStats),
    post: vi.fn().mockResolvedValue({}),
    listSegments: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(makeMockApi() as unknown as ReturnType<typeof useApi>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('BroadcastsPage — stats and broadcast list', () => {
  it('renders broadcast name correctly after data loads', async () => {
    render(
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('Q3 NPS')).toBeInTheDocument(),
    );
  });

  it('renders stat card labels using t() keys', async () => {
    render(
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Q3 NPS')).toBeInTheDocument());

    expect(screen.getByText('broadcasts.stats.pending')).toBeInTheDocument();
    expect(screen.getByText('broadcasts.stats.sent')).toBeInTheDocument();
  });
});

describe('BroadcastsPage — tab filtering', () => {
  it('refetches with status=pending_approval param when Pending Approval tab is clicked', async () => {
    const mockGet = makeMockGet([pendingBroadcast], defaultStats);
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>,
    );

    // Wait for initial load
    await waitFor(() => expect(screen.getByText('Q3 NPS')).toBeInTheDocument());

    const initialCallCount = mockGet.mock.calls.length;

    await user.click(screen.getByRole('button', { name: 'Pending Approval' }));

    await waitFor(() => {
      expect(mockGet.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    const allCalledUrls = mockGet.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(allCalledUrls.some((u) => u.includes('status=pending_approval'))).toBe(true);
  });

  it('refetches with status=sent when the Sent tab is clicked', async () => {
    const mockGet = makeMockGet([], defaultStats);
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>,
    );

    // Wait for initial load to settle
    await waitFor(() => mockGet.mock.calls.length >= 2);

    await user.click(screen.getByRole('button', { name: 'Sent' }));

    await waitFor(() => {
      const urls = mockGet.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(urls.some((u) => u.includes('status=sent'))).toBe(true);
    });
  });
});

describe('BroadcastsPage — create broadcast form', () => {
  it('shows validation error when Next is clicked without a broadcast name', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>,
    );

    // Wait for initial data load
    await waitFor(() => expect(screen.getByText('Q3 NPS')).toBeInTheDocument());

    // Click the first "broadcasts.new" button (in page header actions)
    const newButtons = screen.getAllByRole('button', { name: 'broadcasts.new' });
    await user.click(newButtons[0]);

    // Wait for sheet to open — the SheetTitle contains "broadcasts.new"
    await waitFor(() => {
      // Next button should now be in the DOM (it's in the sheet)
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
    });

    // Click Next without entering a name
    await user.click(screen.getByRole('button', { name: 'Next' }));

    expect(screen.getByText('Broadcast name is required')).toBeInTheDocument();
  });

  it('advances to step 2 when a valid name is entered and Next is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Q3 NPS')).toBeInTheDocument());

    const newButtons = screen.getAllByRole('button', { name: 'broadcasts.new' });
    await user.click(newButtons[0]);

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument(),
    );

    await user.type(
      screen.getByPlaceholderText('broadcasts.form.namePlaceholder'),
      'My Test Broadcast',
    );

    await user.click(screen.getByRole('button', { name: 'Next' }));

    // Step 2 shows the audience section label
    await waitFor(() =>
      expect(screen.getByText('broadcasts.form.audience')).toBeInTheDocument(),
    );
  });
});

describe('BroadcastsPage — empty state', () => {
  it('shows broadcasts.noItems when the broadcasts list is empty', async () => {
    const mockGet = makeMockGet([], emptyStats);
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet }) as unknown as ReturnType<typeof useApi>,
    );

    render(
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('broadcasts.noItems')).toBeInTheDocument(),
    );
  });

  it('shows broadcasts.noItemsDescription in the empty state', async () => {
    const mockGet = makeMockGet([], emptyStats);
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet }) as unknown as ReturnType<typeof useApi>,
    );

    render(
      <MemoryRouter>
        <BroadcastsPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('broadcasts.noItemsDescription')).toBeInTheDocument(),
    );
  });
});

describe('BroadcastsPage — error state', () => {
  it('does not crash when the API get call throws', async () => {
    const mockGet = vi.fn().mockRejectedValue(new Error('Network error'));
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet }) as unknown as ReturnType<typeof useApi>,
    );

    expect(() =>
      render(
        <MemoryRouter>
          <BroadcastsPage />
        </MemoryRouter>,
      ),
    ).not.toThrow();

    // After the rejected promise settles, the broadcast should not appear (graceful degradation)
    await waitFor(() => {
      expect(screen.queryByText('Q3 NPS')).not.toBeInTheDocument();
    });
  });
});
