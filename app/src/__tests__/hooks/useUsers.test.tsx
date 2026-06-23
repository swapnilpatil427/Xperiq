import { renderHook, waitFor, act } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DirectoryUser } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { useUsers } from '../../hooks/useUsers';

function makeUser(overrides: Partial<DirectoryUser> = {}): DirectoryUser {
  return {
    userId: 'u1', orgId: 'o1', email: 'a@x.io', firstName: 'A', lastName: 'B',
    displayName: 'A B', avatarUrl: null, phone: null, employeeId: null, jobTitle: null,
    departmentId: null, departmentName: null, managerUserId: null, costCenter: null,
    location: null, timezone: 'UTC', locale: 'en', roleId: 'r1', roleKey: 'org:analyst',
    roleName: 'Analyst', seatWeight: 1, isActive: true, status: 'active', lastSeenAt: null,
    customAttributes: {}, surveySegments: [], provisionedBy: 'invite',
    createdAt: '2026-01-01', updatedAt: '2026-01-01', deprovisionedAt: null, ...overrides,
  };
}

const mockListUsers = vi.fn();
const mockUpdateUser = vi.fn();
const mockDeleteUser = vi.fn();
const mockInviteUser = vi.fn();
const mockApi = { listUsers: mockListUsers, updateUser: mockUpdateUser, deleteUser: mockDeleteUser, inviteUser: mockInviteUser };

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(mockApi as unknown as ReturnType<typeof useApi>);
  mockListUsers.mockResolvedValue({ users: [makeUser()], total: 1, limit: 25, offset: 0, hasMore: false });
});
afterEach(() => vi.clearAllMocks());

describe('useUsers', () => {
  it('loads users on mount', async () => {
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.users).toHaveLength(1);
    expect(result.current.total).toBe(1);
  });

  it('captures errors', async () => {
    mockListUsers.mockRejectedValueOnce(new Error('boom'));
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current.users).toEqual([]);
  });

  it('updates a user in place', async () => {
    mockUpdateUser.mockResolvedValue({ user: makeUser({ roleName: 'Admin', roleId: 'r2' }) });
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.updateUser('u1', { roleId: 'r2' }); });
    expect(result.current.users[0].roleName).toBe('Admin');
    expect(mockUpdateUser).toHaveBeenCalledWith('u1', { roleId: 'r2' });
  });

  it('marks a user deactivated on delete', async () => {
    mockDeleteUser.mockResolvedValue({ success: true });
    const { result } = renderHook(() => useUsers());
    await waitFor(() => expect(result.current.loading).toBe(false));
    await act(async () => { await result.current.deleteUser('u1'); });
    expect(result.current.users[0].status).toBe('deactivated');
    expect(result.current.users[0].isActive).toBe(false);
  });
});
