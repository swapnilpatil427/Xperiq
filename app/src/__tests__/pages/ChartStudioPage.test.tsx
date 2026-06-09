import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChartSpec } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { ChartStudioPage } from '../../pages/ChartStudioPage';

const spec: ChartSpec = {
  chartType: 'bar', x: 'region', y: 'nps', aggregate: 'avg',
  title: 'NPS by region', rationale: 'Detected a bar chart of nps by region (avg).', encoding: {},
};

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue({
    getOrgAnalytics: vi.fn().mockResolvedValue({ responses_by_day: [{ day: '2026-06-01', count: 12 }] }),
    generateChartSpec: vi.fn().mockResolvedValue({ spec }),
  } as unknown as ReturnType<typeof useApi>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ChartStudioPage', () => {
  it('generates a chart spec from a natural-language example', async () => {
    const user = userEvent.setup();
    render(<ChartStudioPage />);
    // Click an example chip → triggers generation.
    await user.click(screen.getByText('Show me NPS by region as a bar chart'));
    await waitFor(() => expect(screen.getByText('NPS by region')).toBeInTheDocument());
    expect(screen.getByText(/Detected a bar chart/)).toBeInTheDocument();
  });
});
