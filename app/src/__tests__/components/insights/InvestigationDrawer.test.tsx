import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LatestCheckpoint, CheckpointDelta } from '../../../types';

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: Record<string, unknown>) => (opts ? `${k}:${JSON.stringify(opts)}` : k),
  }),
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

// Recharts: renders just a div so tests don't need a full canvas environment.
vi.mock('recharts', () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="linechart">{children}</div>,
  Line: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// shadcn Sheet: render children unconditionally when open=true.
vi.mock('@/components/ui/sheet', () => ({
  Sheet: ({ open, children }: { open: boolean; children: React.ReactNode }) =>
    open ? <>{children}</> : null,
  SheetContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const mockOpenCrystal = vi.fn();
vi.mock('../../../contexts/crystalPanel', () => ({
  useCrystalPanel: () => ({ openCrystal: mockOpenCrystal }),
}));

import { InvestigationDrawer } from '../../../components/insights/InvestigationDrawer';

function baseCheckpoint(overrides: Partial<LatestCheckpoint> = {}): LatestCheckpoint {
  return {
    number: 3,
    nps: 42,
    delta: null,
    meaningful: true,
    created_at: new Date(Date.now() - 3_600_000).toISOString(),
    trigger: 'stream',
    new_responses: 120,
    csat: null,
    ces: null,
    model: 'gpt-4o',
    ...overrides,
  };
}

function baseDelta(overrides: Partial<CheckpointDelta> = {}): CheckpointDelta {
  return {
    nps_delta: 4.2,
    csat_delta: null,
    response_count_delta: 120,
    topic_changes: {
      emerged: ['Billing', 'Speed'],
      resolved: ['Wait Time'],
      persisted: ['Staff'],
    },
    trend_direction: 'up',
    trend_persistence: 'rising',
    ...overrides,
  };
}

const onClose = vi.fn();

beforeEach(() => {
  mockOpenCrystal.mockClear();
  onClose.mockClear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('InvestigationDrawer', () => {
  it('renders the loading skeleton when checkpoint is null', () => {
    render(
      <InvestigationDrawer open onClose={onClose} checkpoint={null} delta={null} />,
    );
    expect(screen.getByText('surveyInsights.investigation.loading')).toBeInTheDocument();
    expect(screen.queryByText('surveyInsights.investigation.drawerTitle')).toBeNull();
  });

  it('renders the drawer title and provenance when checkpoint is provided', () => {
    render(
      <InvestigationDrawer
        open
        onClose={onClose}
        checkpoint={baseCheckpoint()}
        delta={null}
      />,
    );
    expect(screen.getByText('surveyInsights.investigation.drawerTitle')).toBeInTheDocument();
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('shows baseline empty state for checkpoint #1 (bootstrap)', () => {
    render(
      <InvestigationDrawer
        open
        onClose={onClose}
        checkpoint={baseCheckpoint({ number: 1 })}
        delta={null}
      />,
    );
    expect(screen.getByText('surveyInsights.investigation.noBaseline')).toBeInTheDocument();
  });

  it('renders emerged and declining topic chips from delta', () => {
    render(
      <InvestigationDrawer
        open
        onClose={onClose}
        checkpoint={baseCheckpoint()}
        delta={baseDelta()}
      />,
    );
    expect(screen.getByText('Billing')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('Wait Time')).toBeInTheDocument();
  });

  it('calls openCrystal when the Crystal banner button is clicked', async () => {
    const user = userEvent.setup();
    render(
      <InvestigationDrawer
        open
        onClose={onClose}
        checkpoint={baseCheckpoint({ number: 3 })}
        delta={baseDelta()}
      />,
    );
    const bannerBtn = screen.getByText('surveyInsights.investigation.crystalBanner');
    await user.click(bannerBtn);
    expect(mockOpenCrystal).toHaveBeenCalledOnce();
  });

  it('renders the sparkline chart when 2+ prior checkpoint points are provided', () => {
    const now = Date.now();
    render(
      <InvestigationDrawer
        open
        onClose={onClose}
        checkpoint={baseCheckpoint({ number: 3 })}
        delta={baseDelta()}
        priorCheckpoints={[
          { number: 1, nps: 38, created_at: new Date(now - 5 * 86_400_000).toISOString() },
          { number: 2, nps: 40, created_at: new Date(now - 2 * 86_400_000).toISOString() },
          { number: 3, nps: 42, created_at: new Date(now - 3_600_000).toISOString() },
        ]}
      />,
    );
    expect(screen.getByTestId('linechart')).toBeInTheDocument();
  });

  it('shows the feature badge when showFeatureBadge=true', () => {
    render(
      <InvestigationDrawer
        open
        onClose={onClose}
        checkpoint={baseCheckpoint()}
        delta={null}
        showFeatureBadge
      />,
    );
    expect(screen.getByText('surveyInsights.investigation.featureFlag')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(
      <InvestigationDrawer open={false} onClose={onClose} checkpoint={baseCheckpoint()} delta={null} />,
    );
    expect(screen.queryByText('surveyInsights.investigation.drawerTitle')).toBeNull();
  });
});
