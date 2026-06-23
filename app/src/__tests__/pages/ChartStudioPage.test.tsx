import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChartSpec } from '../../lib/api';

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
  ScatterChart: () => <div data-testid="scatter-chart" />,
  Area: () => null,
  Line: () => null,
  Bar: () => null,
  Pie: () => null,
  Cell: () => null,
  Scatter: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
  ReferenceDot: () => null,
}));

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { ChartStudioPage } from '../../pages/ChartStudioPage';

const barSpec: ChartSpec = {
  chartType: 'bar',
  x: 'region',
  y: 'nps',
  aggregate: 'avg',
  title: 'NPS by region',
  rationale: 'Detected a bar chart of nps by region (avg).',
  encoding: {},
};

const lineSpec: ChartSpec = {
  chartType: 'line',
  x: 'day',
  y: 'csat',
  aggregate: 'avg',
  title: 'CSAT trend over time',
  rationale: 'Line chart shows CSAT trend.',
  encoding: {},
};

const areaSpec: ChartSpec = {
  chartType: 'area',
  x: 'day',
  y: 'responses',
  aggregate: 'count',
  title: 'Response volume over time',
  rationale: 'Area chart shows response volume.',
  encoding: {},
};

const orgAnalyticsData = {
  responses_by_day: [{ day: '2026-06-01', count: 12 }],
};

function buildApiMock(specOverride: ChartSpec = barSpec, overrides: Record<string, unknown> = {}) {
  return {
    getOrgAnalytics: vi.fn().mockResolvedValue(orgAnalyticsData),
    generateChartSpec: vi.fn().mockResolvedValue({ spec: specOverride }),
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(buildApiMock());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><ChartStudioPage /></MemoryRouter>);
}

describe('ChartStudioPage', () => {
  it('renders without crash', () => {
    expect(() => renderPage()).not.toThrow();
  });

  it('renders the input field and submit button', () => {
    renderPage();
    expect(screen.getByPlaceholderText('visual.placeholder')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'visual.generate' })).toBeInTheDocument();
  });

  it('renders all example pills', () => {
    renderPage();
    expect(screen.getByText('Show me NPS by region as a bar chart')).toBeInTheDocument();
    expect(screen.getByText('How has CSAT trended over time?')).toBeInTheDocument();
    expect(screen.getByText('Sentiment distribution as a pie')).toBeInTheDocument();
    expect(screen.getByText('Responses by survey')).toBeInTheDocument();
  });

  it('clicking example pill auto-fills input and triggers api.generateChartSpec', async () => {
    const user = userEvent.setup();
    const mockGenerate = vi.fn().mockResolvedValue({ spec: barSpec });
    vi.mocked(useApi).mockReturnValue(buildApiMock(barSpec, { generateChartSpec: mockGenerate }));
    renderPage();
    await user.click(screen.getByText('Show me NPS by region as a bar chart'));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('Show me NPS by region as a bar chart'));
  });

  it('after generation, chart card renders with title and chart type badge', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Show me NPS by region as a bar chart'));
    await waitFor(() =>
      expect(screen.getByText('NPS by region')).toBeInTheDocument(),
    );
    expect(screen.getByText(/Detected a bar chart/)).toBeInTheDocument();
    // Chart type badge
    expect(screen.getByText('bar')).toBeInTheDocument();
  });

  it('bar chart type renders data-testid="bar-chart"', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Show me NPS by region as a bar chart'));
    await waitFor(() => expect(screen.getByTestId('bar-chart')).toBeInTheDocument());
  });

  it('line chart type renders data-testid="line-chart"', async () => {
    const user = userEvent.setup();
    vi.mocked(useApi).mockReturnValue(buildApiMock(lineSpec));
    renderPage();
    await user.click(screen.getByText('How has CSAT trended over time?'));
    await waitFor(() => expect(screen.getByTestId('line-chart')).toBeInTheDocument());
  });

  it('area chart type renders data-testid="area-chart"', async () => {
    const user = userEvent.setup();
    vi.mocked(useApi).mockReturnValue(buildApiMock(areaSpec));
    renderPage();
    // Type directly in the input and submit
    const input = screen.getByPlaceholderText('visual.placeholder');
    await user.type(input, 'Response volume area chart');
    await user.click(screen.getByRole('button', { name: 'visual.generate' }));
    await waitFor(() => expect(screen.getByTestId('area-chart')).toBeInTheDocument());
  });

  it('error state: when generateChartSpec rejects, error banner is shown', async () => {
    const user = userEvent.setup();
    vi.mocked(useApi).mockReturnValue(
      buildApiMock(barSpec, {
        generateChartSpec: vi.fn().mockRejectedValue(new Error('AI service unavailable')),
      }),
    );
    renderPage();
    await user.click(screen.getByText('Show me NPS by region as a bar chart'));
    await waitFor(() =>
      expect(screen.getByText('AI service unavailable')).toBeInTheDocument(),
    );
  });

  it('submit button is disabled while loading', async () => {
    // Slow API - never resolves during this test
    let resolveGenerate!: (value: unknown) => void;
    const slowGenerate = vi.fn().mockReturnValue(
      new Promise((resolve) => { resolveGenerate = resolve; }),
    );
    vi.mocked(useApi).mockReturnValue(buildApiMock(barSpec, { generateChartSpec: slowGenerate }));
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByPlaceholderText('visual.placeholder');
    await user.type(input, 'Show me NPS by region');
    const submitBtn = screen.getByRole('button', { name: 'visual.generate' });
    await user.click(submitBtn);
    // While generating, button shows loading text and is disabled
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'visual.generating' })).toBeDisabled(),
    );
    // Clean up the pending promise
    resolveGenerate({ spec: barSpec });
  });

  it('submit button is disabled when input is empty', () => {
    renderPage();
    const submitBtn = screen.getByRole('button', { name: 'visual.generate' });
    expect(submitBtn).toBeDisabled();
  });

  it('typing in input and submitting via form calls generateChartSpec', async () => {
    const user = userEvent.setup();
    const mockGenerate = vi.fn().mockResolvedValue({ spec: barSpec });
    vi.mocked(useApi).mockReturnValue(buildApiMock(barSpec, { generateChartSpec: mockGenerate }));
    renderPage();
    const input = screen.getByPlaceholderText('visual.placeholder');
    await user.type(input, 'Show me NPS by region as a bar chart');
    await user.click(screen.getByRole('button', { name: 'visual.generate' }));
    await waitFor(() => expect(mockGenerate).toHaveBeenCalledWith('Show me NPS by region as a bar chart'));
  });

  it('rationale text is rendered from spec', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Show me NPS by region as a bar chart'));
    await waitFor(() =>
      expect(screen.getByText(/Detected a bar chart of nps by region/)).toBeInTheDocument(),
    );
  });

  it('chart title is rendered from spec', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('Show me NPS by region as a bar chart'));
    await waitFor(() =>
      expect(screen.getByText('NPS by region')).toBeInTheDocument(),
    );
  });
});
