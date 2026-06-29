import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { CustomReportDetail } from '../../../types';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (p: React.ComponentProps<'div'>) => <div {...p} /> }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('../../../components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <div><h1>{title}</h1></div>,
}));

vi.mock('../../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));

vi.mock('../../../lib/features', () => ({
  getFeatureFlags: () => ({ insightsTrajectoryV1: true }),
}));

vi.mock('../../../hooks/useApi', () => ({ useApi: vi.fn() }));

import { useApi } from '../../../hooks/useApi';
import { CustomReportPage } from '../../../pages/insights/CustomReportPage';

function buildDetail(overrides: Partial<CustomReportDetail> = {}): CustomReportDetail {
  return {
    report: {
      id: 'rep1',
      survey_id: 's1',
      name: 'Q2 Analysis',
      slug: null,
      status: 'completed',
      filter_spec: {},
      filter_label: 'Region: West',
      corpus_size: null,
      sample_size: 120,
      low_confidence: false,
      created_at: new Date().toISOString(),
      created_by: null,
      completed_at: null,
    },
    insights: [
      {
        id: 'ins1',
        layer: 'descriptive',
        category: null,
        headline: 'Response volume up 12%',
        narrative: 'Positive trend driven by the West region.',
        trust_score: 85,
        filter_label: null,
        sample_size: null,
      },
    ],
    ...overrides,
  };
}

function buildApi(overrides: Record<string, unknown> = {}) {
  return {
    getCustomReport: vi.fn().mockResolvedValue(buildDetail()),
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

function renderPage(reportId = 'rep1') {
  return render(
    <MemoryRouter initialEntries={[`/app/surveys/s1/intelligence/custom/${reportId}`]}>
      <Routes>
        <Route
          path="/app/surveys/:surveyId/intelligence/custom/:reportId"
          element={<CustomReportPage />}
        />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(buildApi());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('CustomReportPage', () => {
  it('renders the report name as the page heading after loading', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Q2 Analysis' })).toBeInTheDocument();
    });
  });

  it('renders an insight headline', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Response volume up 12%')).toBeInTheDocument();
    });
  });

  it('renders the insight narrative', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Positive trend driven by the West region.')).toBeInTheDocument();
    });
  });

  it('shows the low-confidence caveat when sample_size < 30', async () => {
    vi.mocked(useApi).mockReturnValue(
      buildApi({
        getCustomReport: vi.fn().mockResolvedValue(
          buildDetail({ report: { ...buildDetail().report, sample_size: 15 } }),
        ),
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument();
    });
  });

  it('does not show the caveat when sample_size >= 30 and low_confidence is false', async () => {
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('Response volume up 12%')).toBeInTheDocument();
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the error state and retry button when getCustomReport rejects', async () => {
    vi.mocked(useApi).mockReturnValue(
      buildApi({ getCustomReport: vi.fn().mockRejectedValue(new Error('500')) }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('surveyInsights.customAnalysis.resultErrorTitle')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'surveyInsights.settings.retry' })).toBeInTheDocument();
  });

  it('retries the load when the retry button is clicked', async () => {
    const getCustomReport = vi.fn()
      .mockRejectedValueOnce(new Error('500'))
      .mockResolvedValue(buildDetail());
    vi.mocked(useApi).mockReturnValue(buildApi({ getCustomReport }));
    const user = userEvent.setup();
    renderPage();

    await waitFor(() =>
      expect(screen.getByText('surveyInsights.customAnalysis.resultErrorTitle')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'surveyInsights.settings.retry' }));

    await waitFor(() => {
      expect(screen.getByText('Response volume up 12%')).toBeInTheDocument();
    });
  });

  it('shows empty state when insights array is empty', async () => {
    vi.mocked(useApi).mockReturnValue(
      buildApi({
        getCustomReport: vi.fn().mockResolvedValue(buildDetail({ insights: [] })),
      }),
    );
    renderPage();
    await waitFor(() => {
      expect(screen.getByText('surveyInsights.customAnalysis.resultEmpty')).toBeInTheDocument();
    });
  });
});
