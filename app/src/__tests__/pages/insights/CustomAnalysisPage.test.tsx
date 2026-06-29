import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('../../../components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('../../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('../../../hooks/useApi', () => ({ useApi: vi.fn() }));

import { useApi } from '../../../hooks/useApi';
import { ManualRunError } from '../../../lib/api';
import { CustomAnalysisPage } from '../../../pages/insights/CustomAnalysisPage';

function buildApi(overrides: Record<string, unknown> = {}) {
  return {
    previewCustomReport: vi.fn().mockResolvedValue({
      estimated_cost: 25, corpus_size: 420, sample_size: 150, low_confidence: false,
    }),
    createCustomReport: vi.fn().mockResolvedValue({ report_id: 'cr1', run_id: 'run1', status: 'pending', slug: 's' }),
    getCustomReport: vi.fn().mockResolvedValue({
      report: { id: 'cr1', status: 'running' }, insights: [], document: null,
    }),
    listCustomReports: vi.fn().mockResolvedValue({ reports: [] }),
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/surveys/s1/intelligence/custom']}>
      <Routes>
        <Route path="/app/surveys/:surveyId/intelligence/custom" element={<CustomAnalysisPage />} />
        <Route path="/app/surveys/:surveyId/intelligence/custom/:reportId" element={<div>RESULT</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

// Advance the wizard from step 1 → step 3.
async function gotoReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'surveyInsights.customAnalysis.next' })); // → step 2
  await user.click(screen.getByRole('button', { name: 'surveyInsights.customAnalysis.next' })); // → step 3
}

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(buildApi());
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('CustomAnalysisPage', () => {
  it('requests a preview when reaching the review step', async () => {
    const api = buildApi();
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup();
    renderPage();
    await gotoReview(user);
    await waitFor(() => expect(vi.mocked(api.previewCustomReport)).toHaveBeenCalled());
    expect(screen.getByText('420')).toBeInTheDocument();
  });

  it('shows the low-confidence warning when the preview is below the sample threshold', async () => {
    const api = buildApi({
      previewCustomReport: vi.fn().mockResolvedValue({
        estimated_cost: 25, corpus_size: 20, sample_size: 20, low_confidence: true,
      }),
    });
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup();
    renderPage();
    await gotoReview(user);
    await waitFor(() => {
      expect(screen.getByText('surveyInsights.customAnalysis.lowConfidence')).toBeInTheDocument();
    });
  });

  it('requires a name before confirming', async () => {
    const api = buildApi();
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup();
    renderPage();
    await gotoReview(user);
    await waitFor(() => expect(screen.getByText('420')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /surveyInsights\.customAnalysis\.confirm/ }));
    expect(screen.getByText('surveyInsights.customAnalysis.nameRequired')).toBeInTheDocument();
    expect(vi.mocked(api.createCustomReport)).not.toHaveBeenCalled();
  });

  it('confirm calls createCustomReport with the name + filter spec', async () => {
    const api = buildApi();
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup();
    renderPage();
    await gotoReview(user);
    await waitFor(() => expect(screen.getByText('420')).toBeInTheDocument());

    await user.type(screen.getByLabelText('surveyInsights.customAnalysis.nameLabel'), 'Q2 deep dive');
    await user.click(screen.getByRole('button', { name: /surveyInsights\.customAnalysis\.confirm/ }));

    await waitFor(() => expect(vi.mocked(api.createCustomReport)).toHaveBeenCalled());
    const body = vi.mocked(api.createCustomReport).mock.calls[0][0];
    expect(body.survey_id).toBe('s1');
    expect(body.name).toBe('Q2 deep dive');
    expect(body.filter_spec.narrative_depth).toBe('standard');
  });

  it('surfaces a credits error when createCustomReport throws a 402 ManualRunError', async () => {
    const api = buildApi({
      createCustomReport: vi.fn().mockRejectedValue(new ManualRunError('INSUFFICIENT_CREDITS', 'no credits', 402)),
    });
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup();
    renderPage();
    await gotoReview(user);
    await waitFor(() => expect(screen.getByText('420')).toBeInTheDocument());
    await user.type(screen.getByLabelText('surveyInsights.customAnalysis.nameLabel'), 'X');
    await user.click(screen.getByRole('button', { name: /surveyInsights\.customAnalysis\.confirm/ }));
    await waitFor(() => {
      expect(screen.getByText('surveyInsights.customAnalysis.errorCredits')).toBeInTheDocument();
    });
  });
});
