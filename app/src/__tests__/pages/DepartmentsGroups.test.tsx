import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { DepartmentNode, UserGroup } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { DepartmentsPage } from '../../pages/settings/DepartmentsPage';
import { GroupsPage } from '../../pages/settings/GroupsPage';

const engineering: DepartmentNode = {
  id: 'd1', name: 'Engineering', description: null, parentDepartmentId: null, headUserId: null,
  headDisplayName: null, headAvatarUrl: null, depth: 0, path: ['d1'], color: null, sortOrder: 0,
  directMemberCount: 2, totalMemberCount: 5,
  children: [{
    id: 'd2', name: 'Platform', description: null, parentDepartmentId: 'd1', headUserId: null,
    headDisplayName: null, headAvatarUrl: null, depth: 1, path: ['d1', 'd2'], color: null, sortOrder: 0,
    directMemberCount: 3, totalMemberCount: 3, children: [],
  }],
};

const pilotGroup: UserGroup = {
  id: 'g1', name: 'Q4 Pilot', description: 'Beta cohort', groupType: 'static',
  dynamicRules: null, scimExternalId: null, memberCount: 12, createdAt: '2026-01-01', updatedAt: '2026-01-01',
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('DepartmentsPage', () => {
  beforeEach(() => {
    vi.mocked(useApi).mockReturnValue({
      listDepartments: vi.fn().mockResolvedValue({ tree: [engineering], flat: [engineering] }),
      createDepartment: vi.fn(), deleteDepartment: vi.fn(),
    } as unknown as ReturnType<typeof useApi>);
  });

  it('renders the department tree with nested children', async () => {
    render(<MemoryRouter><DepartmentsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Engineering')).toBeInTheDocument());
    expect(screen.getByText('Platform')).toBeInTheDocument();
  });
});

describe('GroupsPage', () => {
  beforeEach(() => {
    vi.mocked(useApi).mockReturnValue({
      listGroups: vi.fn().mockResolvedValue({ groups: [pilotGroup] }),
      createGroup: vi.fn(), deleteGroup: vi.fn(),
    } as unknown as ReturnType<typeof useApi>);
  });

  it('renders groups with type badge and member count', async () => {
    render(<MemoryRouter><GroupsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Q4 Pilot')).toBeInTheDocument());
    expect(screen.getByText('12 members')).toBeInTheDocument();
  });
});
