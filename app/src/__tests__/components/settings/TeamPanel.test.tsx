import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── mocks (before component imports) ──────────────────────────────────────────

vi.mock('../../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

let mockPerms: {
  role: string | null; isAdmin: boolean; isAnalyst: boolean; isViewer: boolean;
  can: (r: string) => boolean;
};
vi.mock('../../../lib/permissions', () => ({
  usePermissions: () => mockPerms,
}));

vi.mock('../../../contexts/brandContext', () => ({
  useBrand: () => ({ brandName: 'Pastry chain' }),
}));

vi.mock('../../../lib/auth.tsx', () => ({
  useAppAuth: () => ({ userId: 'user_self' }),
}));

vi.mock('../../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

// ── imports after mocks ────────────────────────────────────────────────────────

import { useApi } from '../../../hooks/useApi';
import { TeamPanel } from '../../../components/settings/TeamPanel';

const MEMBERS = [
  { userId: 'user_self', identifier: 'me@co.com', firstName: 'Me', lastName: 'Self', role: 'org:admin', joinedAt: '2026-06-01T00:00:00Z' },
  { userId: 'u2', identifier: 'ben@co.com', firstName: 'Ben', lastName: 'Okafor', role: 'org:member', joinedAt: '2026-06-02T00:00:00Z' },
];

function makeApi(overrides: Record<string, unknown> = {}) {
  return {
    getMembers: vi.fn().mockResolvedValue({ members: MEMBERS, total: MEMBERS.length }),
    inviteMember: vi.fn().mockResolvedValue({ success: true }),
    updateMemberRole: vi.fn().mockResolvedValue({ success: true }),
    removeMember: vi.fn().mockResolvedValue({ success: true }),
    ...overrides,
  };
}

const adminPerms = { role: 'org:admin', isAdmin: true, isAnalyst: true, isViewer: true, can: () => true };
const viewerPerms = { role: 'org:viewer', isAdmin: false, isAnalyst: false, isViewer: true, can: () => false };

beforeEach(() => {
  mockPerms = adminPerms;
  vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TeamPanel — identity awareness', () => {
  it('shows the org name and the humanized role with admin indicator', async () => {
    render(<TeamPanel />);
    expect(screen.getByText('Pastry chain')).toBeInTheDocument();
    // role badge humanizes org:admin → "admin"
    expect(screen.getByText('admin')).toBeInTheDocument();
    // admin capability lines are present
    expect(screen.getByText('settings.team.capability.manageTeam')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Ben Okafor')).toBeInTheDocument());
  });

  it('lists members returned by the API', async () => {
    render(<TeamPanel />);
    await waitFor(() => {
      expect(screen.getByText('Me Self')).toBeInTheDocument();
      expect(screen.getByText('Ben Okafor')).toBeInTheDocument();
    });
  });
});

describe('TeamPanel — admin actions', () => {
  it('invites a member with the selected role default', async () => {
    const api = makeApi();
    vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
    const user = userEvent.setup();

    render(<TeamPanel />);
    await waitFor(() => expect(screen.getByText('Ben Okafor')).toBeInTheDocument());

    await user.type(screen.getByPlaceholderText('settings.team.invitePlaceholder'), 'new@co.com');
    await user.click(screen.getByRole('button', { name: /settings\.team\.inviteCta/ }));

    await waitFor(() =>
      expect(api.inviteMember).toHaveBeenCalledWith('new@co.com', 'org:member'),
    );
  });
});

describe('TeamPanel — non-admin', () => {
  it('hides the invite form and shows the admin-only hint', async () => {
    mockPerms = viewerPerms;
    render(<TeamPanel />);
    await waitFor(() => expect(screen.getByText('Ben Okafor')).toBeInTheDocument());

    expect(screen.queryByPlaceholderText('settings.team.invitePlaceholder')).not.toBeInTheDocument();
    expect(screen.getByText('settings.team.adminOnlyHint')).toBeInTheDocument();
  });
});

describe('TeamPanel — error handling', () => {
  it('shows a load error without crashing when getMembers rejects', async () => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({ getMembers: vi.fn().mockRejectedValue(new Error('boom')) }) as unknown as ReturnType<typeof useApi>,
    );
    render(<TeamPanel />);
    await waitFor(() => expect(screen.getByText('settings.team.loadError')).toBeInTheDocument());
  });
});
