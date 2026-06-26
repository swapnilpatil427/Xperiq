import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { SeatBreakdown, AuditEvent } from '../../lib/api';

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

import { useApi } from '../../hooks/useApi';
import { SeatsPage } from '../../pages/settings/SeatsPage';
import { AuditLogPage } from '../../pages/settings/AuditLogPage';

const seats: SeatBreakdown = {
  planTier: 'growth', seatLimit: 25, billableSeats: 8, available: 17, gracePeriodEnd: null,
  byRole: [{ roleName: 'Admin', builtinKey: 'org:admin', seatWeight: 1, activeUsers: 3, billable: 3 }],
};

const auditEvent: AuditEvent = {
  id: 'e1', eventType: 'user.role_changed', actorUserId: 'admin', actorName: 'Admin', actorEmail: 'a@x.io',
  actorType: 'user', targetUserId: 'u2', targetName: 'Bob', targetResourceType: 'user', targetResourceId: 'u2',
  ipAddress: null, occurredAt: '2026-06-01T10:00:00Z',
};

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('SeatsPage', () => {
  beforeEach(() => {
    vi.mocked(useApi).mockReturnValue({ getSeatBreakdown: vi.fn().mockResolvedValue(seats) } as unknown as ReturnType<typeof useApi>);
  });
  it('shows plan, usage, and role breakdown', async () => {
    render(<MemoryRouter><SeatsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('8 / 25')).toBeInTheDocument());
    expect(screen.getByText('Admin')).toBeInTheDocument();
  });
});

describe('AuditLogPage', () => {
  beforeEach(() => {
    vi.mocked(useApi).mockReturnValue({
      listAuditLogs: vi.fn().mockResolvedValue({ events: [auditEvent], total: 1, page: 1, limit: 100, pages: 1 }),
      exportAuditLogsCsv: vi.fn(),
    } as unknown as ReturnType<typeof useApi>);
  });
  it('renders audit events and an export action', async () => {
    render(<MemoryRouter><AuditLogPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('user.role_changed')).toBeInTheDocument());
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
  });
});
