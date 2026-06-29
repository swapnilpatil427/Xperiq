import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

import { InsightDocumentCard } from '../../../components/insights/InsightDocumentCard';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderCard(doc: Parameters<typeof InsightDocumentCard>[0]['doc']) {
  return render(<MemoryRouter><InsightDocumentCard doc={doc} /></MemoryRouter>);
}

describe('InsightDocumentCard', () => {
  it('renders the title, automated lane, and an open-report link', () => {
    renderCard({
      title: 'Insight Report · Checkpoint #14',
      run_mode: 'automated_incremental',
      created_at: '2026-06-24T00:00:00Z',
      executive_summary: 'NPS slipped this week.',
      nps: 41, nps_delta: -3.2, new_response_count: 12, insights_count: 8,
      emerged_topics: ['Billing confusion'],
      declining_topics: ['Slow login'],
      document_url: '/app/surveys/s1/intelligence/reports/r1',
    });
    expect(screen.getByText('Insight Report · Checkpoint #14')).toBeInTheDocument();
    expect(screen.getByText('surveyInsights.documentCard.automated')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /openReport/ });
    expect(link).toHaveAttribute('href', '/app/surveys/s1/intelligence/reports/r1');
  });

  it('shows the manual lane label for manual run modes', () => {
    renderCard({ title: 'Expert report', run_mode: 'manual_expert', document_url: '/x' });
    expect(screen.getByText('surveyInsights.documentCard.manual')).toBeInTheDocument();
  });

  it('truncates a long executive summary to ~400 chars with an ellipsis', () => {
    const long = 'a'.repeat(800);
    renderCard({ title: 'T', executive_summary: long });
    const node = screen.getByText(/a+…$/);
    expect(node.textContent!.length).toBeLessThanOrEqual(402);
  });

  it('omits the CTA when there is no document_url', () => {
    renderCard({ title: 'No link' });
    expect(screen.queryByRole('link', { name: /openReport/ })).toBeNull();
  });
});
