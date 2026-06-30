import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, afterEach, vi } from 'vitest';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

const mockOpenCrystal = vi.fn();
vi.mock('../../../contexts/crystalPanel', () => ({
  useCrystalPanel: () => ({ openCrystal: mockOpenCrystal }),
}));

import { DryRunDiff } from '../../../components/prism/DryRunDiff';
import { parityAcknowledged } from '../../../components/prism/ParityCheck';
import type { DryRunReport } from '../../../types/prism';
import type { ParityEntry } from '../../../types/prism';

function buildReport(overrides: Partial<DryRunReport> = {}): DryRunReport {
  return {
    summary: { create: 120, update: 5, skip_duplicate: 3, conflict: 0 },
    metric_parity: [],
    unmapped_fields: [
      { source_field: 'Q1', action: 'mapped' },
      { source_field: 'meta_browser', action: 'embedded_data' },
    ],
    timestamp_continuity: { earliest: '2025-01-01', latest: '2026-01-01', gaps: [] },
    conflicts: [],
    ...overrides,
  };
}

const npsMismatch: ParityEntry = {
  metric: 'nps',
  source_value: 40,
  prism_computed: 42,
  match: false,
  delta: 2,
  explanation: "rounding: source uses banker's; Prism uses half-up",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DryRunDiff', () => {
  it('renders the "nothing imported yet" reassurance banner', () => {
    render(<DryRunDiff report={buildReport()} methods={{}} onChooseMethod={vi.fn()} />);
    expect(screen.getByText('prism.review.nothingYet')).toBeInTheDocument();
  });

  it('renders the create / update / mapped count lines', () => {
    render(<DryRunDiff report={buildReport()} methods={{}} onChooseMethod={vi.fn()} />);
    expect(screen.getByText('prism.review.willHappen')).toBeInTheDocument();
    expect(screen.getByText('prism.review.created')).toBeInTheDocument();
    expect(screen.getByText('prism.review.updated')).toBeInTheDocument();
    expect(screen.getByText('prism.review.mapped')).toBeInTheDocument();
  });

  it('shows the resolve-conflicts affordance only when conflicts exist', async () => {
    const onResolve = vi.fn();
    const { rerender } = render(
      <DryRunDiff report={buildReport()} methods={{}} onChooseMethod={vi.fn()} onResolveConflicts={onResolve} />,
    );
    expect(screen.queryByText('prism.review.resolve')).not.toBeInTheDocument();

    rerender(
      <DryRunDiff
        report={buildReport({ summary: { create: 1, update: 0, skip_duplicate: 0, conflict: 2 } })}
        methods={{}}
        onChooseMethod={vi.fn()}
        onResolveConflicts={onResolve}
      />,
    );
    const resolveBtn = screen.getByRole('button', { name: /prism\.review\.resolve/ });
    expect(resolveBtn).toBeInTheDocument();
    await userEvent.click(resolveBtn);
    expect(onResolve).toHaveBeenCalled();
  });

  it('renders the metric parity section + a parity row for a mismatched metric', () => {
    render(
      <DryRunDiff report={buildReport({ metric_parity: [npsMismatch] })} methods={{}} onChooseMethod={vi.fn()} />,
    );
    expect(screen.getByText('prism.review.parity')).toBeInTheDocument();
    expect(screen.getByText('nps')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument(); // source value
    expect(screen.getByText('42')).toBeInTheDocument(); // prism computed
    // The method-choice buttons are present (acknowledge-to-proceed UI).
    expect(screen.getByText('prism.review.parityMatchSource')).toBeInTheDocument();
    expect(screen.getByText('prism.review.parityKeepPrism')).toBeInTheDocument();
  });

  it('renders the sample preview table when sample rows are present', () => {
    render(
      <DryRunDiff
        report={buildReport({ sample: [{ name: 'Alice', score: 9 }, { name: 'Bob', score: 3 }] })}
        methods={{}}
        onChooseMethod={vi.fn()}
      />,
    );
    expect(screen.getByText('prism.review.sampleTitle')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('choosing a parity method fires onChooseMethod', async () => {
    const onChoose = vi.fn();
    render(
      <DryRunDiff report={buildReport({ metric_parity: [npsMismatch] })} methods={{}} onChooseMethod={onChoose} />,
    );
    await userEvent.click(screen.getByText('prism.review.parityKeepPrism'));
    expect(onChoose).toHaveBeenCalledWith('nps', 'prism');
  });
});

describe('parityAcknowledged — blocks approve until acknowledged', () => {
  it('is false while a mismatched metric has no chosen method', () => {
    expect(parityAcknowledged([npsMismatch], {})).toBe(false);
  });

  it('becomes true once every mismatch has a method chosen', () => {
    expect(parityAcknowledged([npsMismatch], { nps: 'prism' })).toBe(true);
  });

  it('is true when all entries already match (no acknowledgement needed)', () => {
    const matched: ParityEntry = { metric: 'csat', source_value: 4.2, prism_computed: 4.2, match: true };
    expect(parityAcknowledged([matched], {})).toBe(true);
  });
});
