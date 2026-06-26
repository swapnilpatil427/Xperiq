import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DirectoryUser, DirectoryRole } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { UserDirectoryPage } from '../../pages/settings/UserDirectoryPage';

const user: DirectoryUser = {
  userId: 'u1', orgId: 'o1', email: 'alice@x.io', firstName: 'Alice', lastName: 'N',
  displayName: 'Alice Nguyen', avatarUrl: null, phone: null, employeeId: null, jobTitle: 'Analyst',
  departmentId: null, departmentName: 'Research', managerUserId: null, costCenter: null,
  location: null, timezone: 'UTC', locale: 'en', roleId: 'r1', roleKey: 'org:analyst',
  roleName: 'Analyst', seatWeight: 1, isActive: true, status: 'active', lastSeenAt: null,
  customAttributes: {}, surveySegments: [], provisionedBy: 'invite',
  createdAt: '2026-01-01', updatedAt: '2026-01-01', deprovisionedAt: null,
};

const role: DirectoryRole = {
  id: 'r1', orgId: 'o1', name: 'Analyst', description: null, isBuiltin: true,
  builtinKey: 'org:analyst', permissions: { 'survey:read': 'ALL' }, seatWeight: 1,
  color: null, assignedCount: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

const mockApi = {
  listUsers: vi.fn().mockResolvedValue({ users: [user], total: 1, limit: 25, offset: 0, hasMore: false }),
  listRoles: vi.fn().mockResolvedValue({ roles: [role] }),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  inviteUser: vi.fn(),
};

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(mockApi as unknown as ReturnType<typeof useApi>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

function renderPage() {
  return render(<MemoryRouter><UserDirectoryPage /></MemoryRouter>);
}

describe('UserDirectoryPage', () => {
  it('renders the loaded directory', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Alice Nguyen')).toBeInTheDocument());
    expect(screen.getByText('alice@x.io')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
  });

  it('shows the invite + roles actions', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Alice Nguyen')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /invite user/i })).toBeInTheDocument();
  });

  it('renders a search box', async () => {
    renderPage();
    expect(screen.getByPlaceholderText(/search by name or email/i)).toBeInTheDocument();
  });
});
