import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── vi.mock calls must appear before all other imports ────────────────────────

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string, _p?: unknown) => k,
  }),
}));
vi.mock('framer-motion', () => ({
  motion: {
    div: (p: React.ComponentProps<'div'>) => React.createElement('div', p),
    tr: (p: React.ComponentProps<'tr'>) => React.createElement('tr', p),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({
    title,
    actions,
  }: {
    title: string;
    actions?: React.ReactNode;
  }) => (
    <div>
      <h1>{title}</h1>
      <div>{actions}</div>
    </div>
  ),
}));
vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({
    children,
  }: {
    children: React.ReactNode;
    onValueChange?: (v: string) => void;
    value?: string;
  }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => <span />,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({
    value,
    children,
  }: {
    value: string;
    children: React.ReactNode;
  }) => <button data-value={value}>{children}</button>,
}));

// ── Component + API imports (after mocks) ─────────────────────────────────────
import { useApi } from '../../hooks/useApi';
import { OwnershipRoutingPage } from '../../pages/OwnershipRoutingPage';
import type { OwnershipRoute } from '../../types';

// ── Fixtures ──────────────────────────────────────────────────────────────────
const route1: OwnershipRoute = {
  id: 'r1',
  dimension: 'segment',
  match_type: 'exact',
  match_value: 'Acme Corp',
  owner_user_id: 'u1',
  owner_label: 'Alice Smith',
  priority: 100,
};

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listOwnershipRoutes: vi.fn().mockResolvedValue([]),
    createOwnershipRoute: vi.fn().mockResolvedValue(route1),
    deleteOwnershipRoute: vi.fn().mockResolvedValue({}),
    resolveOwnershipRoute: vi
      .fn()
      .mockResolvedValue({ matched: false, route: null }),
    ...overrides,
  };
}

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('OwnershipRoutingPage — routing rules list', () => {
  it('renders match_value and owner_label in the table', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listOwnershipRoutes: vi.fn().mockResolvedValue([route1]),
      }) as unknown as ReturnType<typeof useApi>,
    );

    render(<MemoryRouter><OwnershipRoutingPage /></MemoryRouter>);

    await waitFor(() =>
      expect(screen.getByText('Acme Corp')).toBeInTheDocument(),
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });
});

describe('OwnershipRoutingPage — add rule', () => {
  it('shows form, fills fields, and calls createOwnershipRoute', async () => {
    const createOwnershipRoute = vi.fn().mockResolvedValue(route1);
    vi.mocked(useApi).mockReturnValue(
      makeApi({ createOwnershipRoute }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(<MemoryRouter><OwnershipRoutingPage /></MemoryRouter>);

    // Click the "Add Rule" button in the PageHeader actions
    // t('ownership.addRule') = 'ownership.addRule'
    const addRuleBtn = screen.getByRole('button', {
      name: /ownership\.addRule/i,
    });
    await user.click(addRuleBtn);

    // Form is now visible — fill match_value input
    const matchValueInput = screen.getByPlaceholderText(
      'ownership.form.matchValuePlaceholder',
    );
    await user.type(matchValueInput, 'test-value');

    // Fill owner_user_id input — there are two inputs sharing this placeholder
    // (owner_user_id + escalation_user_id), so use getAllByPlaceholderText and pick the first.
    const ownerInputs = screen.getAllByPlaceholderText(
      'ownership.form.ownerUserIdPlaceholder',
    );
    await user.type(ownerInputs[0], 'user-123');

    // Save button: t('ownership.saveRule') = 'ownership.saveRule'
    const saveBtn = screen.getByRole('button', {
      name: /ownership\.saveRule/i,
    });
    // Should be enabled now that both required fields are filled
    expect(saveBtn).not.toBeDisabled();
    await user.click(saveBtn);

    await waitFor(() =>
      expect(createOwnershipRoute).toHaveBeenCalledWith(
        expect.objectContaining({
          match_value: 'test-value',
          owner_user_id: 'user-123',
        }),
      ),
    );
  });
});

describe('OwnershipRoutingPage — delete rule', () => {
  it('calls deleteOwnershipRoute with the route id', async () => {
    const deleteOwnershipRoute = vi.fn().mockResolvedValue({});
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listOwnershipRoutes: vi.fn().mockResolvedValue([route1]),
        deleteOwnershipRoute,
      }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(<MemoryRouter><OwnershipRoutingPage /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Acme Corp')).toBeInTheDocument());

    // The delete button is a plain <button> containing <Icon name="delete" />
    const deleteBtn = screen.getAllByRole('button').find(
      (btn) => btn.querySelector('[data-icon="delete"]'),
    );
    expect(deleteBtn).toBeDefined();
    await user.click(deleteBtn!);

    await waitFor(() =>
      expect(deleteOwnershipRoute).toHaveBeenCalledWith('r1'),
    );
  });
});

describe('OwnershipRoutingPage — test-route tool', () => {
  it('calls resolveOwnershipRoute and shows matched owner', async () => {
    const resolveOwnershipRoute = vi
      .fn()
      .mockResolvedValue({ matched: true, route: route1 });
    vi.mocked(useApi).mockReturnValue(
      makeApi({ resolveOwnershipRoute }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(<MemoryRouter><OwnershipRoutingPage /></MemoryRouter>);

    // Wait for page to load
    await waitFor(() =>
      expect(screen.getByPlaceholderText('ownership.testPlaceholder')).toBeInTheDocument(),
    );

    const testInput = screen.getByPlaceholderText('ownership.testPlaceholder');
    await user.type(testInput, 'Acme Corp');

    const testBtn = screen.getByRole('button', {
      name: 'ownership.testButton',
    });
    await user.click(testBtn);

    await waitFor(() =>
      expect(resolveOwnershipRoute).toHaveBeenCalledWith('segment', 'Acme Corp'),
    );

    // t('ownership.matchedOwner', { owner: 'Alice Smith' }) returns 'ownership.matchedOwner'
    await waitFor(() =>
      expect(screen.getByText('ownership.matchedOwner')).toBeInTheDocument(),
    );
  });
});

describe('OwnershipRoutingPage — empty state', () => {
  it('shows ownership.empty text when there are no routes', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listOwnershipRoutes: vi.fn().mockResolvedValue([]),
      }) as unknown as ReturnType<typeof useApi>,
    );

    render(<MemoryRouter><OwnershipRoutingPage /></MemoryRouter>);

    // t('ownership.empty', { dimension: ... }) returns 'ownership.empty'
    await waitFor(() =>
      expect(screen.getByText('ownership.empty')).toBeInTheDocument(),
    );
  });
});
