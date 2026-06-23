import React from 'react';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
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
  RadialBarChart: ({ children }: { children: React.ReactNode }) => <div data-testid="radial-chart">{children}</div>,
  Area: () => null,
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  RadialBar: () => null,
  PolarAngleAxis: () => null,
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

function buildApiMock(overrides: Record<string, unknown> = {}) {
  return {
    getDashboardConfig: vi.fn().mockResolvedValue(null),
    saveDashboardConfig: vi.fn().mockResolvedValue({ name: 'My Dashboard', widgets: [], filters: {} }),
    listSurveys: vi.fn().mockResolvedValue({ surveys: [{ id: 's1', title: 'CSAT Survey' }] }),
    listTags: vi.fn().mockResolvedValue({ tags: [{ id: 't1', name: 'VOC', color: '#6366f1' }] }),
    getDashboardSummary: vi.fn().mockResolvedValue(summary),
    getOrgMetricHistory: vi.fn().mockResolvedValue(historyData),
    getSurveyMetricHistory: vi.fn().mockResolvedValue({ history: [] }),
    getDashboardOperations: vi.fn().mockResolvedValue(opsData),
    getDashboardInsights: vi.fn().mockResolvedValue({ actionItems: [], recentActivity: [], discoveryCount: 0 }),
    getOrgAnalytics: vi.fn().mockResolvedValue({ responses_by_day: [] }),
    getSurveyAnalytics: vi.fn().mockResolvedValue({ responses_by_day: [] }),
    listTopics: vi.fn().mockResolvedValue({ topics: [] }),
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

describe('DashboardPage (configurable widgets)', () => {
  it('renders the Crystal narrative headline from summary', async () => {
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText('Momentum is positive')).toBeInTheDocument(),
    );
  });

  it('renders the toolbar with Add Widget and Save buttons', async () => {
    renderDashboard();
    expect(screen.getByText('dashboard.toolbar.addWidget')).toBeInTheDocument();
    // Initial load has no unsaved changes — button shows "saved" state
    expect(screen.getByText('dashboard.toolbar.saved')).toBeInTheDocument();
  });

  it('renders the default NPS KPI tile from summary data', async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText('45')).toBeInTheDocument());
    expect(screen.getAllByText('dashboard.kpiNps').length).toBeGreaterThan(0);
  });

  it('"Ask Crystal" button calls openCrystal from useCrystalPanel', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await waitFor(() => expect(screen.getByText('Momentum is positive')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /dashboard\.askCrystal/i }));
    expect(mockOpenCrystal).toHaveBeenCalledTimes(1);
  });

  it('opens the widget library panel when Add Widget is clicked', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await user.click(screen.getByText('dashboard.toolbar.addWidget'));
    await waitFor(() =>
      expect(screen.getByText('dashboard.widgetLibrary.subtitle')).toBeInTheDocument(),
    );
  });

  it('loads the saved config on mount', async () => {
    const getConfig = vi.fn().mockResolvedValue(null);
    vi.mocked(useApi).mockReturnValue(buildApiMock({ getDashboardConfig: getConfig }));
    renderDashboard();
    await waitFor(() => expect(getConfig).toHaveBeenCalledTimes(1));
  });

  it('date range change to 30d triggers a new getDashboardSummary(30) call', async () => {
    const mockGetSummary = vi.fn().mockResolvedValue(summary);
    vi.mocked(useApi).mockReturnValue(buildApiMock({ getDashboardSummary: mockGetSummary }));
    const defaultFilters = { surveyId: null, tagId: null, npsSegment: 'all' as const };
    renderDashboard();
    // default is 90d
    await waitFor(() => expect(mockGetSummary).toHaveBeenCalledWith(90, defaultFilters));
    fireEvent.click(screen.getByText('30d'));
    await waitFor(() => expect(mockGetSummary).toHaveBeenCalledWith(30, defaultFilters));
  });

  it('renders narrative paragraphs from summary', async () => {
    renderDashboard();
    await waitFor(() =>
      expect(screen.getByText(/organization-wide NPS rose to 45/)).toBeInTheDocument(),
    );
  });
});
