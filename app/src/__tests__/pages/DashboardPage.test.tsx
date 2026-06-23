import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DashboardSummary } from '../../lib/api';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: (p: React.ComponentProps<'div'>) => <div {...p} />,
    section: (p: React.ComponentProps<'section'>) => <section {...p} />,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AreaChart: () => <div data-testid="area-chart" />,
  LineChart: () => <div data-testid="line-chart" />,
  BarChart: () => <div data-testid="bar-chart" />,
  PieChart: () => <div data-testid="pie-chart" />,
  Area: () => null,
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
  ReferenceDot: () => null,
}));

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

const mockOpenCrystal = vi.fn();
vi.mock('../../contexts/crystalPanel', () => ({
  useCrystalPanel: () => ({
    openCrystal: mockOpenCrystal,
    setScope: vi.fn(),
    setCrystalData: vi.fn(),
  }),
}));

vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));

vi.mock('../../components/dashboard/CustomLayout', () => ({
  CustomLayout: () => <div data-testid="custom-layout" />,
}));

import { useApi } from '../../hooks/useApi';
import { DashboardPage } from '../../pages/DashboardPage';

const summary: DashboardSummary = {
  kpis: {
    nps: 45,
    npsDelta: 7,
    csat: 4.2,
    csatDelta: 0.1,
    responses: 320,
    responsesDelta: 40,
    activeSurveys: 5,
  },
  topMover: { title: 'Q4 NPS', npsDelta: -12 },
  narrative: {
    headline: 'Momentum is positive',
    paragraphs: [
      'Over the last 30 days, organization-wide NPS rose to 45 (up 7 points).',
      '320 responses came in (up 40 vs. the prior period).',
    ],
    sentiment: 'positive',
  },
  forecast: { slope: 5, intercept: 30, points: [50, 55, 60], direction: 'up', r2: 0.98 },
  anomalies: [],
};

const historyData = {
  history: [
    { captured_at: '2026-05-01', avg_nps: 40 },
    { captured_at: '2026-06-01', avg_nps: 45 },
  ],
};

const opsData = {
  surveys: [{ id: 's1', title: 'CSAT Survey', responseCount: 50, nps: 30, freshness: 'fresh' }],
  anomalies: [{ id: 'an1', title: 'Drop in NPS', severity: 'warning' }],
};

const insightsData = {
  actionItems: [{ id: 'a1', title: 'Fix checkout flow', severity: 'critical' }],
  recentActivity: [{ id: 'n1', title: 'New insight generated', createdAt: '2026-06-01T10:00:00Z' }],
  discoveryCount: 3,
};

function buildApiMock(overrides: Record<string, unknown> = {}) {
  return {
    getDashboardSummary: vi.fn().mockResolvedValue(summary),
    getOrgMetricHistory: vi.fn().mockResolvedValue(historyData),
    getDashboardOperations: vi.fn().mockResolvedValue(opsData),
    getDashboardInsights: vi.fn().mockResolvedValue(insightsData),
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

beforeEach(() => {
  mockOpenCrystal.mockClear();
  vi.mocked(useApi).mockReturnValue(buildApiMock());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderDashboard() {
  return render(<MemoryRouter><DashboardPage /></MemoryRouter>);
}

describe('DashboardPage', () => {
  it('renders the Crystal narrative headline text', async () => {
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText('Momentum is positive')).toBeInTheDocument(),
    );
  });

  it('renders all 5 tab triggers', () => {
    renderDashboard();
    expect(screen.getByRole('tab', { name: 'dashboard.layouts.executive' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'dashboard.layouts.analyst' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'dashboard.layouts.operations' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'dashboard.layouts.insights' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'dashboard.layouts.custom' })).toBeInTheDocument();
  });

  it('renders NPS KPI tile with value 45 from summary data', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('45')).toBeInTheDocument());
    expect(screen.getByText('dashboard.kpiNps')).toBeInTheDocument();
  });

  it('"Ask Crystal" button calls openCrystal from useCrystalPanel', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Momentum is positive')).toBeInTheDocument());
    const buttons = screen.getAllByRole('button', { name: /dashboard\.askCrystal/i });
    await user.click(buttons[0]);
    expect(mockOpenCrystal).toHaveBeenCalledTimes(1);
  });

  it('switching to Analyst tab shows metrics table', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Momentum is positive')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: 'dashboard.layouts.analyst' }));
    await waitFor(() =>
      expect(screen.getByText('dashboard.analyst.title')).toBeInTheDocument(),
    );
    expect(screen.getByText('dashboard.analyst.metric')).toBeInTheDocument();
    expect(screen.getByText('dashboard.analyst.current')).toBeInTheDocument();
    expect(screen.getByText('dashboard.analyst.change')).toBeInTheDocument();
  });

  it('switching to Operations tab shows Health Matrix + Anomalies sections', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'dashboard.layouts.operations' }));
    await waitFor(() =>
      expect(screen.getByText('dashboard.ops.healthMatrix')).toBeInTheDocument(),
    );
    expect(screen.getByText('dashboard.ops.anomalies')).toBeInTheDocument();
  });

  it('switching to Insights tab shows Action Board + Activity sections', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'dashboard.layouts.insights' }));
    await waitFor(() =>
      expect(screen.getByText('dashboard.insights.actionBoard')).toBeInTheDocument(),
    );
    expect(screen.getByText('dashboard.insights.activity')).toBeInTheDocument();
  });

  it('switching to Custom tab renders CustomLayout', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByRole('tab', { name: 'dashboard.layouts.custom' }));
    expect(screen.getByTestId('custom-layout')).toBeInTheDocument();
  });

  it('date range select: changing to 90 days triggers another getDashboardSummary(90) call', async () => {
    const mockGetSummary = vi.fn().mockResolvedValue(summary);
    const mockGetHistory = vi.fn().mockResolvedValue(historyData);
    vi.mocked(useApi).mockReturnValue(
      buildApiMock({
        getDashboardSummary: mockGetSummary,
        getOrgMetricHistory: mockGetHistory,
      }),
    );
    renderDashboard();
    await waitFor(() => expect(mockGetSummary).toHaveBeenCalledTimes(1));
    // The Select component wraps a hidden <select>; fire a change event on it directly
    // to avoid Radix UI pointer-capture issues in jsdom.
    const hiddenSelect = document.querySelector('select') as HTMLSelectElement;
    if (hiddenSelect) {
      // Change value to 90 via fireEvent on the underlying select
      const { fireEvent } = await import('@testing-library/react');
      fireEvent.change(hiddenSelect, { target: { value: '90' } });
      await waitFor(() => expect(mockGetSummary).toHaveBeenCalledTimes(2));
      expect(mockGetSummary).toHaveBeenLastCalledWith(90);
    } else {
      // Fallback: verify at least one call was made on initial render
      expect(mockGetSummary).toHaveBeenCalledWith(90);
    }
  });

  it('error state: when getDashboardSummary rejects, error banner is shown', async () => {
    vi.mocked(useApi).mockReturnValue(
      buildApiMock({
        getDashboardSummary: vi.fn().mockRejectedValue(new Error('Network failure')),
      }),
    );
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText('Network failure')).toBeInTheDocument(),
    );
  });

  it('renders NPS trend chart when history data is present', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('area-chart')).toBeInTheDocument());
  });

  it('renders narrative paragraphs from summary', async () => {
    renderDashboard();
    await waitFor(() =>
      expect(
        screen.getByText(/organization-wide NPS rose to 45/),
      ).toBeInTheDocument(),
    );
  });
});
