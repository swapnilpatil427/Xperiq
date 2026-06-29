import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { LatestCheckpoint, CheckpointDelta } from '../../../types';

// Replace framer-motion with plain HTML so animations don't interfere.
vi.mock('framer-motion', () => ({
  motion: new Proxy(
    {},
    {
      get: () =>
        ({ children, ...p }: React.HTMLAttributes<HTMLElement>) => <div {...p}>{children}</div>,
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Stub the shadcn dropdown so the Generate menu renders inline (no portal).
vi.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuTrigger: ({ children, ...p }: React.HTMLAttributes<HTMLButtonElement>) => (
    <button {...p}>{children}</button>
  ),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button onClick={onClick}>{children}</button>
  ),
}));

import { EnhancedHeaderBand } from '../../../components/insights/EnhancedHeaderBand';

afterEach(cleanup);

function makeDelta(over: Partial<CheckpointDelta> = {}): CheckpointDelta {
  return {
    nps_delta: -3.2,
    csat_delta: null,
    response_count_delta: 12,
    topic_changes: { emerged: ['Billing confusion'], resolved: ['Slow login'], persisted: [] },
    trend_direction: 'down',
    trend_persistence: '',
    ...over,
  };
}

function makeCheckpoint(over: Partial<LatestCheckpoint> = {}): LatestCheckpoint {
  return {
    number: 14,
    nps: 41,
    delta: makeDelta(),
    meaningful: true,
    created_at: new Date().toISOString(),
    trigger: 'stream',
    new_responses: 12,
    ...over,
  };
}

describe('EnhancedHeaderBand — delta chip color by trend', () => {
  it('renders a rose (down) delta chip when nps_delta < -2', () => {
    const cp = makeCheckpoint({ delta: makeDelta({ nps_delta: -3.2, trend_direction: 'down' }) });
    render(<EnhancedHeaderBand checkpoint={cp} delta={cp.delta} onOpenDrawer={() => {}} />);
    const chip = screen.getByRole('button', { name: /decreased 3\.2 points/i });
    expect(chip.className).toContain('rose');
  });

  it('renders an emerald (up) delta chip when nps_delta > 2', () => {
    const cp = makeCheckpoint({
      nps: 47,
      delta: makeDelta({ nps_delta: 4.0, trend_direction: 'up' }),
    });
    render(<EnhancedHeaderBand checkpoint={cp} delta={cp.delta} onOpenDrawer={() => {}} />);
    const chip = screen.getByRole('button', { name: /increased 4\.0 points/i });
    expect(chip.className).toContain('emerald');
  });

  it('renders a neutral (stable) delta chip when abs(nps_delta) < 2', () => {
    const cp = makeCheckpoint({
      delta: makeDelta({ nps_delta: 0.5, trend_direction: 'stable' }),
    });
    render(<EnhancedHeaderBand checkpoint={cp} delta={cp.delta} onOpenDrawer={() => {}} />);
    const chip = screen.getByRole('button', { name: /unchanged since checkpoint 13/i });
    expect(chip.className).toContain('zinc');
  });
});

describe('EnhancedHeaderBand — states', () => {
  it('shows the NPS value', () => {
    const cp = makeCheckpoint();
    render(<EnhancedHeaderBand checkpoint={cp} delta={cp.delta} onOpenDrawer={() => {}} />);
    expect(screen.getByText('41')).toBeTruthy();
  });

  it('hides the delta chip in bootstrap state (checkpoint #1)', () => {
    const cp = makeCheckpoint({ number: 1, delta: null });
    render(<EnhancedHeaderBand checkpoint={cp} delta={null} onOpenDrawer={() => {}} />);
    expect(screen.queryByRole('button', { name: /since checkpoint/i })).toBeNull();
  });

  it('hides the delta chip in legacy state (delta === null, #>1)', () => {
    const cp = makeCheckpoint({ number: 14, delta: null });
    render(<EnhancedHeaderBand checkpoint={cp} delta={null} onOpenDrawer={() => {}} />);
    // No delta chip, but NPS + View details still render.
    expect(screen.queryByRole('button', { name: /points since/i })).toBeNull();
    expect(screen.getByRole('button', { name: /view investigation details for checkpoint/i })).toBeTruthy();
  });

  it('shows the analyzing message while generating and hides View details', () => {
    const cp = makeCheckpoint();
    render(
      <EnhancedHeaderBand
        checkpoint={cp}
        delta={cp.delta}
        runStatus="running"
        newResponseCount={5}
        onOpenDrawer={() => {}}
      />,
    );
    expect(screen.getByText(/Analyzing 5 new responses/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /view investigation details for checkpoint/i })).toBeNull();
  });
});

describe('EnhancedHeaderBand — interactions', () => {
  it('opens the drawer when the delta chip is clicked', async () => {
    const onOpen = vi.fn();
    const cp = makeCheckpoint();
    render(<EnhancedHeaderBand checkpoint={cp} delta={cp.delta} onOpenDrawer={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /decreased 3\.2 points/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('opens the drawer when "View details" is clicked', async () => {
    const onOpen = vi.fn();
    const cp = makeCheckpoint();
    render(<EnhancedHeaderBand checkpoint={cp} delta={cp.delta} onOpenDrawer={onOpen} />);
    await userEvent.click(screen.getByRole('button', { name: /view investigation details for checkpoint/i }));
    expect(onOpen).toHaveBeenCalledOnce();
  });

  it('calls onRefresh when the refresh button is clicked', async () => {
    const onRefresh = vi.fn();
    const cp = makeCheckpoint();
    render(
      <EnhancedHeaderBand
        checkpoint={cp}
        delta={cp.delta}
        onOpenDrawer={() => {}}
        onRefresh={onRefresh}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /refresh/i }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it('renders emerged and declining count chips', () => {
    const cp = makeCheckpoint({
      delta: makeDelta({
        topic_changes: { emerged: ['A', 'B'], resolved: ['C'], persisted: [] },
      }),
    });
    render(<EnhancedHeaderBand checkpoint={cp} delta={cp.delta} onOpenDrawer={() => {}} />);
    expect(screen.getByText(/2 emerged/i)).toBeTruthy();
    expect(screen.getByText(/1 declining/i)).toBeTruthy();
  });
});

describe('EnhancedHeaderBand — Generate menu (Phase 5/6 entries)', () => {
  it('renders the Custom analysis and Settings menu items when handlers are provided', () => {
    const cp = makeCheckpoint();
    render(
      <EnhancedHeaderBand
        checkpoint={cp}
        delta={cp.delta}
        onOpenDrawer={() => {}}
        onOpenCustomAnalysis={() => {}}
        onOpenSettings={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /custom analysis/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /intelligence settings/i })).toBeTruthy();
  });

  it('omits the new menu items when their handlers are not provided', () => {
    const cp = makeCheckpoint();
    render(<EnhancedHeaderBand checkpoint={cp} delta={cp.delta} onOpenDrawer={() => {}} />);
    expect(screen.queryByRole('button', { name: /custom analysis/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /intelligence settings/i })).toBeNull();
  });

  it('invokes onOpenCustomAnalysis and onOpenSettings when the menu items are clicked', async () => {
    const onCustom = vi.fn();
    const onSettings = vi.fn();
    const cp = makeCheckpoint();
    render(
      <EnhancedHeaderBand
        checkpoint={cp}
        delta={cp.delta}
        onOpenDrawer={() => {}}
        onOpenCustomAnalysis={onCustom}
        onOpenSettings={onSettings}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: /custom analysis/i }));
    await userEvent.click(screen.getByRole('button', { name: /intelligence settings/i }));
    expect(onCustom).toHaveBeenCalledOnce();
    expect(onSettings).toHaveBeenCalledOnce();
  });
});
