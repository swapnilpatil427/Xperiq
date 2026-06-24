import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AlertEvent, AlertRule } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { AlertsPage } from '../../pages/AlertsPage';

const event: AlertEvent = {
  id: 'ev1', ruleId: 'r1', surveyId: 's1', alertType: 'S-01', severity: 'critical',
  title: 'NPS dropped 12 points', description: 'NPS fell from 42 to 30.',
  crystalNarration: 'Driven by shipping delays.', crystalAction: null,
  metricValue: 30, metricBaseline: 42, metricChange: -12, status: 'active',
  triggeredAt: '2026-06-01T10:00:00Z', snoozedUntil: null,
};
const rule: AlertRule = {
  id: 'r1', orgId: 'o1', surveyId: null, alertType: 'S-01', name: 'Critical NPS drop',
  description: null, isActive: true, isSystem: false, severity: 'critical', thresholdConfig: {}, createdAt: '2026-01-01',
};

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue({
    listAlertEvents: vi.fn().mockResolvedValue({ events: [event] }),
    listAlertRules: vi.fn().mockResolvedValue({ rules: [rule] }),
    acknowledgeAlert: vi.fn(), resolveAlert: vi.fn(), snoozeAlert: vi.fn(),
    createAlertRule: vi.fn(), deleteAlertRule: vi.fn(),
    listAlertTypes: vi.fn().mockResolvedValue({ types: [] }),
    getAlertSubscriptions: vi.fn().mockResolvedValue({ subscriptions: [] }),
    updateAlertSubscription: vi.fn(),
  } as unknown as ReturnType<typeof useApi>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('AlertsPage', () => {
  it('renders active alert events with Crystal narration + actions', async () => {
    render(<MemoryRouter><AlertsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('NPS dropped 12 points')).toBeInTheDocument());
    expect(screen.getByText('Driven by shipping delays.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /acknowledge/i })).toBeInTheDocument();
  });

  it('exposes the new-rule action', async () => {
    render(<MemoryRouter><AlertsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('NPS dropped 12 points')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /new alert rule/i })).toBeInTheDocument();
  });
});
