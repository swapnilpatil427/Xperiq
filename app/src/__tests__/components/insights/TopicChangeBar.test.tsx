import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { CheckpointDelta } from '../../../types';

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

import { TopicChangeBar } from '../../../components/insights/TopicChangeBar';

afterEach(cleanup);

function makeDelta(over: Partial<CheckpointDelta> = {}): CheckpointDelta {
  return {
    nps_delta: -3.2,
    csat_delta: null,
    response_count_delta: 12,
    topic_changes: { emerged: ['Wait Time'], resolved: ['Billing'], persisted: [] },
    trend_direction: 'down',
    trend_persistence: '',
    ...over,
  };
}

describe('TopicChangeBar', () => {
  it('renders emerged and declining topic chips', () => {
    render(<TopicChangeBar delta={makeDelta()} prevCheckpoint={13} />);
    expect(screen.getByText('Wait Time')).toBeTruthy();
    expect(screen.getByText('Billing')).toBeTruthy();
  });

  it('renders nothing when there are no topic changes', () => {
    const empty = makeDelta({ topic_changes: { emerged: [], resolved: [], persisted: [] } });
    const { container } = render(<TopicChangeBar delta={empty} prevCheckpoint={13} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when delta is null', () => {
    const { container } = render(<TopicChangeBar delta={null} prevCheckpoint={13} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the "since checkpoint" label with the prior checkpoint number', () => {
    render(<TopicChangeBar delta={makeDelta()} prevCheckpoint={13} />);
    expect(screen.getByText(/Since checkpoint #13/i)).toBeTruthy();
  });

  it('exposes a live region for screen readers', () => {
    render(<TopicChangeBar delta={makeDelta()} prevCheckpoint={13} />);
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('omits the label when withLabel is false (drawer reuse)', () => {
    render(<TopicChangeBar delta={makeDelta()} prevCheckpoint={13} withLabel={false} />);
    expect(screen.queryByText(/Since checkpoint/i)).toBeNull();
    expect(screen.getByText('Wait Time')).toBeTruthy();
  });
});
