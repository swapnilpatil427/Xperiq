import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

// The Icon component renders Material Symbols text — stub to a span.
vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

vi.mock('../../../hooks/useApi', () => ({ useApi: vi.fn() }));

import { useApi } from '../../../hooks/useApi';
import { ManualRunDialog } from '../../../components/insights/ManualRunDialog';
import { ManualRunError } from '../../../lib/api';

function buildApi(overrides: Record<string, unknown> = {}) {
  return {
    previewManualRun: vi.fn().mockResolvedValue({
      estimated_cost: 40,
      corpus_size: 1240,
      estimated_duration_label: '~4 min',
      sample_size: 500,
    }),
    triggerManualRun: vi.fn().mockResolvedValue({ run_id: 'r1', status: 'started', report_id: 'rep1' }),
    getInsightRunStatus: vi.fn().mockResolvedValue({ run_id: 'r1', status: 'running', stream_events: [] }),
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(buildApi());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ManualRunDialog', () => {
  it('calls previewManualRun on open with the default (expert) mode', async () => {
    const api = buildApi();
    vi.mocked(useApi).mockReturnValue(api);
    render(<ManualRunDialog open onClose={() => {}} surveyId="s1" />);
    await waitFor(() => {
      expect(vi.mocked(api.previewManualRun)).toHaveBeenCalled();
    });
    const firstCallArgs = vi.mocked(api.previewManualRun).mock.calls[0];
    expect(firstCallArgs[0]).toBe('s1');
    expect((firstCallArgs[1] as { mode: string }).mode).toBe('expert');
  });

  it('switching mode re-requests the preview with the new mode', async () => {
    const api = buildApi();
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup();
    render(<ManualRunDialog open onClose={() => {}} surveyId="s1" />);

    await waitFor(() => expect(vi.mocked(api.previewManualRun)).toHaveBeenCalled());
    const callsBefore = vi.mocked(api.previewManualRun).mock.calls.length;

    // Click the "Quick" mode card (aria-pressed button containing the Quick name key).
    const quickBtn = screen.getByRole('button', { name: /modeQuick/ });
    await user.click(quickBtn);

    await waitFor(() => {
      const calls = vi.mocked(api.previewManualRun).mock.calls;
      expect(calls.length).toBeGreaterThan(callsBefore);
      const last = calls[calls.length - 1];
      expect((last[1] as { mode: string }).mode).toBe('quick');
    });
  });

  it('renders the preview corpus + cost once loaded', async () => {
    render(<ManualRunDialog open onClose={() => {}} surveyId="s1" />);
    await waitFor(() => {
      expect(screen.getByText('1,240')).toBeInTheDocument();
    });
    // Cost value uses an interpolated key — assert the credits key appears.
    expect(screen.getByText(/previewCostValue/)).toBeInTheDocument();
  });

  it('shows the insufficient-credits message when triggerManualRun throws a 402 ManualRunError', async () => {
    const api = buildApi({
      triggerManualRun: vi.fn().mockRejectedValue(
        new ManualRunError('INSUFFICIENT_CREDITS', 'no credits', 402),
      ),
    });
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup();
    render(<ManualRunDialog open onClose={() => {}} surveyId="s1" />);

    await waitFor(() => expect(screen.getByText('1,240')).toBeInTheDocument());

    const confirm = screen.getByRole('button', { name: 'surveyInsights.manualRun.confirm' });
    await user.click(confirm);

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('surveyInsights.manualRun.errorCredits');
    });
    // The upgrade CTA is shown for the credits case.
    expect(screen.getByText('surveyInsights.manualRun.errorCreditsCta')).toBeInTheDocument();
  });

  it('shows the rate-limited message on a 429 ManualRunError', async () => {
    const api = buildApi({
      triggerManualRun: vi.fn().mockRejectedValue(
        new ManualRunError('RATE_LIMITED', 'slow down', 429),
      ),
    });
    vi.mocked(useApi).mockReturnValue(api);
    const user = userEvent.setup();
    render(<ManualRunDialog open onClose={() => {}} surveyId="s1" />);

    await waitFor(() => expect(screen.getByText('1,240')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'surveyInsights.manualRun.confirm' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('surveyInsights.manualRun.errorRateLimited');
    });
  });
});
