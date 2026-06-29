import React from 'react';
import { render, screen, waitFor, cleanup, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { TrailCheckpoint } from '../../../types';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: () => (p: React.ComponentProps<'div'>) => <div {...p} />,
  }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

// Keep PageHeader simple — just render the title text.
vi.mock('../../../components/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div><h1>{title}</h1>{actions}</div>
  ),
}));

// Heavy children — stub so the test focuses on the trail timeline.
vi.mock('../../../components/insights/InvestigationDrawer', () => ({
  InvestigationDrawer: ({ open }: { open: boolean }) =>
    open ? <div data-testid="drawer">drawer</div> : null,
}));
vi.mock('../../../components/insights/ManualRunDialog', () => ({
  ManualRunDialog: ({ open }: { open: boolean }) =>
    open ? <div data-testid="manual-dialog">dialog</div> : null,
}));

vi.mock('../../../hooks/useApi', () => ({ useApi: vi.fn() }));
vi.mock('../../../hooks/useBreakpoint', () => ({ useBreakpoint: vi.fn(() => 'desktop') }));
vi.mock('../../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('../../../lib/features', () => ({
  getFeatureFlags: () => ({ insightsTrajectoryV1: true, showInsightTrail: true }),
}));

import { useApi } from '../../../hooks/useApi';
import { useBreakpoint } from '../../../hooks/useBreakpoint';
import { InsightTrailPage } from '../../../pages/insights/InsightTrailPage';

const now = Date.now();
const iso = (daysAgo: number) => new Date(now - daysAgo * 86_400_000).toISOString();

function cp(partial: Partial<TrailCheckpoint> & { id: string; number: number }): TrailCheckpoint {
  return {
    lane: 'automated',
    run_mode: null,
    trigger: 'stream',
    nps: 40,
    csat: null,
    ces: null,
    delta: null,
    meaningful: true,
    created_at: iso(1),
    created_by: null,
    report_label: null,
    report_id: null,
    window_start: null,
    window_end: null,
    ...partial,
  };
}

// 3 consecutive quiet automated checkpoints (rollup) + 1 meaningful + 1 manual.
const checkpoints: TrailCheckpoint[] = [
  cp({ id: 'a1', number: 14, meaningful: true, nps: 41, delta: {
    nps_delta: -3.2, csat_delta: null, response_count_delta: 12,
    topic_changes: { emerged: ['Billing'], resolved: [], persisted: [] },
    trend_direction: 'down', trend_persistence: '',
  } }),
  cp({ id: 'q1', number: 13, meaningful: false, nps: 44 }),
  cp({ id: 'q2', number: 12, meaningful: false, nps: 44 }),
  cp({ id: 'q3', number: 11, meaningful: false, nps: 44 }),
  cp({ id: 'm1', number: 20, lane: 'manual', run_mode: 'manual_expert', report_id: 'rep1',
       report_label: 'Q2 board prep', created_by: 'Sarah', nps: 38, meaningful: true,
       window_start: iso(80), window_end: iso(1) }),
];

function buildApi(overrides: Record<string, unknown> = {}) {
  return {
    getInsightTrail: vi.fn().mockResolvedValue({ checkpoints, reports: [], next_cursor: null }),
    compareCheckpoints: vi.fn().mockResolvedValue({
      a: checkpoints[1], b: checkpoints[0],
      metric_deltas: { nps: -3, csat: null, ces: null },
      topic_diff: { added: ['Billing'], removed: [] },
    }),
    getInsightReport: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/surveys/s1/intelligence/trail']}>
      <Routes>
        <Route path="/app/surveys/:surveyId/intelligence/trail" element={<InsightTrailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(buildApi());
  vi.mocked(useBreakpoint).mockReturnValue('desktop');
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InsightTrailPage', () => {
  it('renders both lane headings after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('surveyInsights.trail.laneAutomatedHeading')).toBeInTheDocument();
    });
    expect(screen.getByText('surveyInsights.trail.laneManualHeading')).toBeInTheDocument();
  });

  it('collapses 3 consecutive quiet automated checkpoints into a rollup', async () => {
    renderPage();
    await waitFor(() => {
      // rollupLabel interpolates count:3
      expect(screen.getByText(/surveyInsights\.trail\.rollupLabel:.*"count":3/)).toBeInTheDocument();
    });
    // The meaningful checkpoint #14 renders as its own node (not collapsed).
    expect(screen.getByText(/surveyInsights\.trail\.checkpointNumber:.*"number":14/)).toBeInTheDocument();
    // Quiet checkpoint #13 is hidden inside the (collapsed) rollup.
    expect(screen.queryByText(/surveyInsights\.trail\.checkpointNumber:.*"number":13/)).toBeNull();
  });

  it('expands the rollup to reveal the quiet checkpoints', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/rollupLabel:.*"count":3/)).toBeInTheDocument(),
    );
    const rollupBtn = screen.getByRole('button', { expanded: false });
    await user.click(rollupBtn);
    await waitFor(() => {
      expect(screen.getByText(/checkpointNumber:.*"number":13/)).toBeInTheDocument();
    });
  });

  it('renders the manual report node with an Open report link', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText(/checkpointNumber:.*"number":20/)).toBeInTheDocument();
    });
    expect(screen.getByText(/reportLabelQuoted:.*Q2 board prep/)).toBeInTheDocument();
    expect(screen.getAllByText('surveyInsights.trail.openReport').length).toBeGreaterThan(0);
  });

  it('compare mode: selecting two checkpoints calls compareCheckpoints and shows the panel', async () => {
    const api = buildApi();
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup({ pointerEventsCheck: false });
    renderPage();

    await waitFor(() =>
      expect(screen.getByText(/checkpointNumber:.*"number":14/)).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText(/checkpointNumber:.*"number":20/)).toBeInTheDocument(),
    );

    // Enter compare mode.
    await user.click(screen.getByRole('button', { name: 'surveyInsights.trail.compare' }));

    await waitFor(() => {
      expect(screen.getByText('surveyInsights.trail.compareHint')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('trail-compare-a1'));
    fireEvent.click(screen.getByTestId('trail-compare-m1'));

    await waitFor(() => {
      expect(api.compareCheckpoints).toHaveBeenCalledWith('s1', 'a1', 'm1');
    });
    await waitFor(() => {
      expect(screen.getByText('surveyInsights.trail.compareTitle')).toBeInTheDocument();
    });
  });

  it('opens the manual run dialog from the Generate report action', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('surveyInsights.trail.laneAutomatedHeading')).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'surveyInsights.trail.generate' }));
    expect(screen.getByTestId('manual-dialog')).toBeInTheDocument();
  });

  it('shows the empty state when there are no checkpoints', async () => {
    vi.mocked(useApi).mockReturnValue(
      buildApi({ getInsightTrail: vi.fn().mockResolvedValue({ checkpoints: [], reports: [], next_cursor: null }) }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('surveyInsights.trail.emptyTitle')).toBeInTheDocument();
    });
  });
});
