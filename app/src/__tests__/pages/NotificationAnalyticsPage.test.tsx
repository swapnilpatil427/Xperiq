import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── vi.mock calls must appear before all other imports ────────────────────────

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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
      <div data-testid="page-actions">{actions}</div>
    </div>
  ),
}));
vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    Link: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
    useNavigate: () => vi.fn(),
  };
});

// ── Component + API imports (after mocks) ─────────────────────────────────────
import { useApi } from '../../hooks/useApi';
import { NotificationAnalyticsPage } from '../../pages/NotificationAnalyticsPage';

// ── Mock data ─────────────────────────────────────────────────────────────────
const summaryData = {
  sent: 1200,
  deliveredRate: 94.0,
  openRate: 32.0,
  clickRate: 8.0,
  bounced: 20,
  suppressed: 15,
};

const channelsData = [
  {
    channel: 'email',
    sent: 800,
    deliveredRate: 95.0,
    openRate: 33.0,
    clickRate: 9.0,
  },
];

const workflowsData = [
  { workflowId: 'survey-invite', sent: 500, deliveredRate: 96.0 },
];

const suppData = {
  total: 15,
  byReason: { unsubscribe: 10, bounce: 5 },
};

const capsData = [{ channel: 'email', maxCount: 3, windowHours: 168 }];

function makeGet() {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('/summary')) return Promise.resolve({ data: summaryData });
    if (url.includes('/channels')) return Promise.resolve({ data: channelsData });
    if (url.includes('/workflows')) return Promise.resolve({ data: workflowsData });
    if (url.includes('/suppression')) return Promise.resolve({ data: suppData });
    if (url.includes('/frequency-caps')) return Promise.resolve({ data: capsData });
    return Promise.reject(new Error('unknown url'));
  });
}

function makePost() {
  return vi.fn().mockResolvedValue({});
}

beforeEach(() => {
  const mockGet = makeGet();
  const mockPost = makePost();
  vi.mocked(useApi).mockReturnValue({
    get: mockGet,
    post: mockPost,
  } as unknown as ReturnType<typeof useApi>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('NotificationAnalyticsPage — KPI cards', () => {
  it('renders sent count and delivered rate from summary data', async () => {
    render(<MemoryRouter><NotificationAnalyticsPage /></MemoryRouter>);

    // summary.sent = 1200 → toLocaleString() = '1,200'
    await waitFor(() =>
      expect(screen.getByText('1,200')).toBeInTheDocument(),
    );

    // summary.deliveredRate = 94.0 → pct() = '94.0%'
    expect(screen.getByText('94.0%')).toBeInTheDocument();
  });
});

describe('NotificationAnalyticsPage — demo data fallback', () => {
  it('shows demoData badge when all API calls fail', async () => {
    const failGet = vi.fn().mockRejectedValue(new Error('network error'));
    vi.mocked(useApi).mockReturnValue({
      get: failGet,
      post: makePost(),
    } as unknown as ReturnType<typeof useApi>);

    render(<MemoryRouter><NotificationAnalyticsPage /></MemoryRouter>);

    await waitFor(() =>
      expect(
        screen.getByText('notificationAnalytics.demoData'),
      ).toBeInTheDocument(),
    );
  });

  it('does not crash when all API calls fail', async () => {
    const failGet = vi.fn().mockRejectedValue(new Error('network error'));
    vi.mocked(useApi).mockReturnValue({
      get: failGet,
      post: makePost(),
    } as unknown as ReturnType<typeof useApi>);

    expect(() =>
      render(<MemoryRouter><NotificationAnalyticsPage /></MemoryRouter>),
    ).not.toThrow();

    // Page renders something (mock summary values come from MOCK_SUMMARY: 4820)
    await waitFor(() => expect(screen.getByText('4,820')).toBeInTheDocument());
  });
});

describe('NotificationAnalyticsPage — period selector', () => {
  it('calls get with period=30d when 30d button is clicked', async () => {
    const mockGet = makeGet();
    vi.mocked(useApi).mockReturnValue({
      get: mockGet,
      post: makePost(),
    } as unknown as ReturnType<typeof useApi>);

    const user = userEvent.setup();
    render(<MemoryRouter><NotificationAnalyticsPage /></MemoryRouter>);

    // Wait for initial load
    await waitFor(() => expect(screen.getByText('1,200')).toBeInTheDocument());

    // t('notificationAnalytics.periods.30d') returns the key
    const btn30d = screen.getByRole('button', {
      name: 'notificationAnalytics.periods.30d',
    });
    await user.click(btn30d);

    await waitFor(() => {
      const calls = (mockGet as ReturnType<typeof vi.fn>).mock.calls as string[][];
      const has30d = calls.some(([url]) => url.includes('period=30d'));
      expect(has30d).toBe(true);
    });
  });
});

describe('NotificationAnalyticsPage — frequency cap edit', () => {
  it('opens CapEditModal when Edit is clicked and saves via post', async () => {
    const mockPost = makePost();
    vi.mocked(useApi).mockReturnValue({
      get: makeGet(),
      post: mockPost,
    } as unknown as ReturnType<typeof useApi>);

    const user = userEvent.setup();
    render(<MemoryRouter><NotificationAnalyticsPage /></MemoryRouter>);

    // Wait for caps to render — the Edit button label comes from t('notificationAnalytics.capEdit')
    // There are multiple "email" text nodes, so wait for the Edit button specifically
    await waitFor(() => {
      const editBtns = screen.queryAllByRole('button', {
        name: /notificationAnalytics\.capEdit/i,
      });
      expect(editBtns.length).toBeGreaterThanOrEqual(1);
    });

    // Click the first Edit button (for the email cap)
    const editBtn = screen.getAllByRole('button', {
      name: /notificationAnalytics\.capEdit/i,
    })[0];
    await user.click(editBtn);

    // Modal opens — DialogTitle contains t('notificationAnalytics.capEdit')
    await waitFor(() => {
      const titles = screen.queryAllByText(/notificationAnalytics\.capEdit/i);
      expect(titles.length).toBeGreaterThanOrEqual(1);
    });

    // Change maxCount input — it is a number input; initial value is "3"
    const inputs = screen.getAllByRole('spinbutton');
    // First input = maxCount, second = windowHours
    const maxCountInput = inputs[0];
    await user.clear(maxCountInput);
    await user.type(maxCountInput, '2');

    // Save button text = t('notificationAnalytics.capSave') = key
    const saveBtn = screen.getByRole('button', {
      name: /notificationAnalytics\.capSave/i,
    });
    await user.click(saveBtn);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith('/api/outreach/frequency-caps', {
        channel: 'email',
        maxCount: 2,
        windowHours: 168,
      }),
    );
  });
});

describe('NotificationAnalyticsPage — suppression count', () => {
  it('renders the suppression total badge', async () => {
    render(<MemoryRouter><NotificationAnalyticsPage /></MemoryRouter>);

    // suppData.total = 15 — shown as a Badge next to the suppressions panel header
    await waitFor(() => {
      const matches = screen.queryAllByText('15');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });
});
