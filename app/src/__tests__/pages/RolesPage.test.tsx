import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DirectoryRole } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { RolesPage } from '../../pages/settings/RolesPage';

const roles: DirectoryRole[] = [
  { id: 'r1', orgId: 'o1', name: 'Admin', description: 'Manage everything', isBuiltin: true,
    builtinKey: 'org:admin', permissions: { 'users:manage': 'ALL', 'survey:read': 'ALL' },
    seatWeight: 1, color: null, assignedCount: 2, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'rc1', orgId: 'o1', name: 'HR Lead', description: 'HR surveys', isBuiltin: false,
    builtinKey: null, permissions: { 'survey:read': 'ALL' }, seatWeight: 1, color: null,
    assignedCount: 0, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

const mockApi = {
  listRoles: vi.fn().mockResolvedValue({ roles }),
  createRole: vi.fn(),
  deleteRole: vi.fn(),
};

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(mockApi as unknown as ReturnType<typeof useApi>);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('RolesPage', () => {
  it('lists built-in and custom roles', async () => {
    render(<MemoryRouter><RolesPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());
    expect(screen.getByText('HR Lead')).toBeInTheDocument();
    expect(screen.getByText('Built-in')).toBeInTheDocument();
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('exposes the create custom role action', async () => {
    render(<MemoryRouter><RolesPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Admin')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /create custom role/i })).toBeInTheDocument();
  });
});
