import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('framer-motion', () => ({
  motion: new Proxy({}, { get: () => (props: Record<string, unknown>) => {
    const { children, ...rest } = props as { children?: React.ReactNode };
    return <div {...(rest as Record<string, unknown>)}>{children}</div>;
  } }),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: () => {} }));
vi.mock('../../lib/dataBus', () => ({ invalidate: vi.fn(), useInvalidation: () => {} }));

const balance = {
  plan_tier: 'growth', monthly_allowance: 12000, allowance_remaining: 8000, pack_balance: 500,
  available: 8500, overage_enabled: false, overage_ceiling: null, overage_used: 0,
  overage_remaining: 0, period_start: new Date().toISOString(), period_days: 30,
};
const config = {
  credit_usd: 0.01, period_days: 30,
  costs: { insight_run: 50, crystal_turn: 15, xo_fusion: 200 },
  plan_allowances: { free: 0, starter: 1500, growth: 12000, enterprise: 80000 },
  free_lifetime_grant: 225,
};

const mockReload = vi.fn();
vi.mock('../../hooks/useCredits', () => ({
  useCredits: () => ({ balance, config, loading: false, error: null, reload: mockReload }),
}));

const apiMock = {
  getCreditUsage:  vi.fn(async () => ({ summary: [{ action_type: 'crystal_turn', total_credits: 300, event_count: 20, total_cost_usd: 0 }], balance, days: 30 })),
  getCreditLedger: vi.fn(async () => ({ entries: [], total: 0 })),
  getCreditPacks:  vi.fn(async () => ({ packs: [{ id: 'insight_bundle', label: 'Insight Bundle', credits: 5000, price_usd: 49 }], stripe_enabled: false })),
  setSpendCap:     vi.fn(async () => balance),
  setPlan:         vi.fn(async () => balance),
  startCheckout:   vi.fn(async () => { throw new Error('not configured'); }),
};
vi.mock('../../hooks/useApi', () => ({ useApi: () => apiMock }));

import { BillingPage } from '../../pages/BillingPage';

function renderPage() {
  return render(<MemoryRouter><BillingPage /></MemoryRouter>);
}

afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); });

describe('BillingPage', () => {
  it('shows the live available balance', () => {
    renderPage();
    expect(screen.getByText('8500')).toBeInTheDocument();
  });

  it('renders the plan cards', () => {
    renderPage();
    expect(screen.getAllByText('Growth').length).toBeGreaterThan(0); // plan badge + plan card
    expect(screen.getByText('Enterprise')).toBeInTheDocument();
    expect(screen.getByText('Starter')).toBeInTheDocument();
  });

  it('changing plan calls api.setPlan', async () => {
    const user = userEvent.setup();
    renderPage();
    // The current plan (growth) button is disabled; click an upgrade button (e.g. Enterprise).
    const upgradeButtons = screen.getAllByText('billing.upgrade');
    await user.click(upgradeButtons[0]);
    await waitFor(() => expect(apiMock.setPlan).toHaveBeenCalled());
  });

  it('saving the spend cap calls api.setSpendCap', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText('billing.save'));
    await waitFor(() => expect(apiMock.setSpendCap).toHaveBeenCalledWith({ overage_enabled: false, overage_ceiling: null }));
  });

  it('loads and renders credit packs; buy attempts checkout', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByText('Insight Bundle')).toBeInTheDocument());
    await user.click(screen.getByText('billing.buy'));
    await waitFor(() => expect(apiMock.startCheckout).toHaveBeenCalledWith('insight_bundle'));
  });
});
