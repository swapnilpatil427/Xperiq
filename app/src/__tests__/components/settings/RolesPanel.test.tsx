import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── mocks (before component imports) ──────────────────────────────────────────

vi.mock('../../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

// ── imports after mocks ────────────────────────────────────────────────────────

import { useApi } from '../../../hooks/useApi';
import { RolesPanel } from '../../../components/settings/RolesPanel';

const ROLES = [
  {
    id: 'r1', orgId: 'o1', name: 'Admin', description: 'Manage everything',
    isBuiltin: true, builtinKey: 'org:admin',
    permissions: { 'survey:read': 'ALL', 'survey:write': 'ALL', 'users:manage': 'ALL', 'billing:manage': 'NONE' },
    seatWeight: 1, color: null, createdAt: '2026-06-01T00:00:00Z',
  },
  {
    id: 'r2', orgId: 'o1', name: 'Member', description: 'Respondents only',
    isBuiltin: true, builtinKey: 'org:member',
    permissions: { 'survey:read': 'NONE', 'survey:write': 'NONE' },
    seatWeight: 0, color: null, createdAt: '2026-06-01T00:00:00Z',
  },
];

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    listRoles: vi.fn().mockResolvedValue({ roles: ROLES }),
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

describe('RolesPanel', () => {
  it('renders each role with its granted permissions and scopes', async () => {
    render(<RolesPanel />);
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());

    expect(screen.getByText('Member')).toBeInTheDocument();
    // granted action humanized ("survey:read" → "survey read")
    expect(screen.getAllByText('survey read').length).toBeGreaterThan(0);
    // scope badge for a granted permission
    expect(screen.getAllByText('ALL').length).toBeGreaterThan(0);
  });

  it('shows "no permissions" for a role with only NONE scopes', async () => {
    render(<RolesPanel />);
    await waitFor(() => expect(screen.getByText('Member')).toBeInTheDocument());
    expect(screen.getByText('settings.roles.noPermissions')).toBeInTheDocument();
  });

  it('shows a load error when listRoles rejects', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({ listRoles: vi.fn().mockRejectedValue(new Error('nope')) }) as unknown as ReturnType<typeof useApi>,
    );
    render(<RolesPanel />);
    await waitFor(() => expect(screen.getByText('settings.roles.loadError')).toBeInTheDocument());
  });
});
