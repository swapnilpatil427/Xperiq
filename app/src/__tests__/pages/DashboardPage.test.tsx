import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DashboardSummary } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
// CrystalPanel context is provided globally in the app; stub it for the page test.
vi.mock('../../contexts/crystalPanel', () => ({ useCrystalPanel: () => ({ openCrystal: vi.fn() }) }));

import { useApi } from '../../hooks/useApi';
import { DashboardPage } from '../../pages/DashboardPage';

const summary: DashboardSummary = {
  kpis: { nps: 45, npsDelta: 7, csat: 4.2, csatDelta: 0.1, responses: 320, responsesDelta: 40, activeSurveys: 5 },
  topMover: { title: 'Q4 NPS', npsDelta: -12 },
  narrative: {
    headline: 'Momentum is positive',
    paragraphs: ['Over the last 30 days, organization-wide NPS rose to 45 (up 7 points).', '320 responses came in (up 40 vs. the prior period).'],
    sentiment: 'positive',
  },
  forecast: { slope: 5, intercept: 30, points: [50, 55, 60], direction: 'up', r2: 0.98 },
  anomalies: [],
};

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue({
    getDashboardSummary: vi.fn().mockResolvedValue(summary),
    getDashboardOperations: vi.fn().mockResolvedValue({ surveys: [], anomalies: [] }),
    getOrgMetricHistory: vi.fn().mockResolvedValue({ history: [{ captured_at: '2026-05-01', avg_nps: 40 }, { captured_at: '2026-06-01', avg_nps: 45 }] }),
  } as unknown as ReturnType<typeof useApi>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('DashboardPage', () => {
  it('renders the Crystal narrative + KPI tiles', async () => {
    render(<MemoryRouter><DashboardPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Momentum is positive')).toBeInTheDocument());
    expect(screen.getByText(/organization-wide NPS rose to 45/)).toBeInTheDocument();
    expect(screen.getByText('NPS')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /ask crystal/i }).length).toBeGreaterThan(0);
  });
});
