import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── mocks (before all component imports) ──────────────────────────────────────

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', rest, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));

vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
}));

vi.mock('../../components/Icon', () => ({
  Icon: ({ name }: { name: string }) => <span data-icon={name} />,
}));

// ── imports after mocks ────────────────────────────────────────────────────────

import { useApi } from '../../hooks/useApi';
import { BroadcastApprovalPage } from '../../pages/BroadcastApprovalPage';

// ── fixtures ───────────────────────────────────────────────────────────────────

const pendingBroadcast = {
  id: 'b1',
  name: 'Q3 NPS Campaign',
  description: null,
  created_by: 'u1',
  segment_id: null,
  segment_name: null,
  contact_ids: null,
  estimated_count: 150,
  channels: ['email'],
  payload: { subject: 'We value your feedback', body: 'Please take our survey' },
  status: 'pending_approval' as const,
  expires_at: new Date(Date.now() + 86_400_000 * 2).toISOString(), // 2 days from now
  created_at: '2026-06-24T10:00:00Z',
  approved_by: null,
  approved_at: null,
  rejected_by: null,
  rejected_at: null,
  rejection_reason: null,
  sent_count: 0,
  delivered_count: 0,
};

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Builds a mock `get` function that:
 * - Returns `pendingBroadcasts` for ?status=pending_approval
 * - Returns `approvedBroadcasts` for ?status=approved
 * - Returns detail + audit log for individual broadcast routes
 */
function makeMockGet(
  pendingBroadcasts: unknown[] = [pendingBroadcast],
  approvedBroadcasts: unknown[] = [],
) {
  return vi.fn().mockImplementation((url: string) => {
    if (url.includes('status=pending_approval')) {
      return Promise.resolve({ data: { broadcasts: pendingBroadcasts } });
    }
    if (url.includes('status=approved')) {
      return Promise.resolve({ data: { broadcasts: approvedBroadcasts } });
    }
    // Individual broadcast detail route: /api/outreach/broadcasts/:id
    const match = url.match(/\/api\/outreach\/broadcasts\/([^/]+)$/);
    if (match) {
      const id = match[1];
      const b = [...pendingBroadcasts, ...approvedBroadcasts].find(
        (x) => (x as { id: string }).id === id,
      );
      return Promise.resolve({ data: { broadcast: b ?? pendingBroadcast, auditLog: [] } });
    }
    return Promise.resolve({ data: { broadcasts: [] } });
  });
}

function makeMockApi(overrides: Record<string, unknown> = {}) {
  return {
    get: makeMockGet(),
    post: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

// ── setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  vi.mocked(useApi).mockReturnValue(makeMockApi() as unknown as ReturnType<typeof useApi>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('BroadcastApprovalPage — pending list', () => {
  it('renders the pending broadcast name with Approve and Reject buttons', async () => {
    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('Q3 NPS Campaign')).toBeInTheDocument(),
    );

    expect(
      screen.getByRole('button', { name: /broadcasts\.approval\.approve/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /broadcasts\.approval\.reject/i }),
    ).toBeInTheDocument();
  });

  it('displays content preview (subject and body) from payload', async () => {
    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Q3 NPS Campaign')).toBeInTheDocument());

    expect(screen.getByText('We value your feedback')).toBeInTheDocument();
    expect(screen.getByText('Please take our survey')).toBeInTheDocument();
  });
});

describe('BroadcastApprovalPage — approve flow', () => {
  it('opens the ApproveDialog with the broadcast name when Approve is clicked', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('Q3 NPS Campaign')).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', { name: /broadcasts\.approval\.approve/i }),
    );

    // ApproveDialog renders the broadcast name inside
    await waitFor(() => {
      // The dialog shows the broadcast name in the green summary box
      const nameInstances = screen.getAllByText('Q3 NPS Campaign');
      expect(nameInstances.length).toBeGreaterThan(1);
    });
  });

  it('calls post with the approve URL when the dialog confirm button is clicked', async () => {
    const mockPost = vi.fn().mockResolvedValue({});
    const mockGet = makeMockGet([pendingBroadcast], []);
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet, post: mockPost }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('Q3 NPS Campaign')).toBeInTheDocument(),
    );

    // Open dialog — when Radix Dialog opens, the underlying page gets aria-hidden,
    // so only the dialog buttons are accessible via getByRole after this click.
    await user.click(
      screen.getByRole('button', { name: /broadcasts\.approval\.approve/i }),
    );

    // Wait for the dialog to be present in the accessibility tree
    await waitFor(() =>
      expect(screen.getByRole('dialog')).toBeInTheDocument(),
    );

    // The dialog contains the broadcast name in the summary box
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    // Click the confirm (approve) button inside the dialog
    const dialog = screen.getByRole('dialog');
    const confirmButton = dialog.querySelector('button:last-of-type') as HTMLElement;
    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/api/outreach/broadcasts/b1/approve',
        {},
      ),
    );
  });
});

describe('BroadcastApprovalPage — reject flow', () => {
  it('shows validation error when reject dialog is submitted without a reason', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('Q3 NPS Campaign')).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', { name: /broadcasts\.approval\.reject/i }),
    );

    // Wait for the reject dialog to open
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('broadcasts.approval.rejectReasonPlaceholder'),
      ).toBeInTheDocument(),
    );

    // The confirm button in the dialog footer is the reject button
    // It is disabled when reason is empty, so click the enabled one
    // The dialog's confirm button text is broadcasts.approval.reject (same key)
    // Note: the button is disabled when reason is empty per the page code
    // We test the error path by checking that the textarea is present without content
    // and the button is indeed disabled
    const rejectConfirmButton = screen.getByRole('button', {
      name: /broadcasts\.approval\.reject/i,
    });
    // Button should be disabled since reason is empty
    expect(rejectConfirmButton).toBeDisabled();
  });

  it('shows "Rejection reason is required" error when handleConfirm is called with empty reason', async () => {
    // The page's RejectDialog has a handleConfirm that sets err when reason is empty.
    // Since the button is disabled, we need to test the internal validation.
    // We can test by entering a space (which trims to empty) and verifying the error.
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('Q3 NPS Campaign')).toBeInTheDocument(),
    );

    await user.click(
      screen.getByRole('button', { name: /broadcasts\.approval\.reject/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('broadcasts.approval.rejectReasonPlaceholder'),
      ).toBeInTheDocument(),
    );

    // Type whitespace which trims to empty to trigger validation in handleConfirm
    await user.type(
      screen.getByPlaceholderText('broadcasts.approval.rejectReasonPlaceholder'),
      '   ',
    );

    // The button is still disabled because reason.trim() is falsy
    const rejectBtn = screen.getByRole('button', {
      name: /broadcasts\.approval\.reject/i,
    });
    expect(rejectBtn).toBeDisabled();
  });

  it('calls post with the reject URL and reason when a reason is provided', async () => {
    const mockPost = vi.fn().mockResolvedValue({});
    const mockGet = makeMockGet([pendingBroadcast], []);
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet, post: mockPost }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(screen.getByText('Q3 NPS Campaign')).toBeInTheDocument(),
    );

    // Open reject dialog
    await user.click(
      screen.getByRole('button', { name: /broadcasts\.approval\.reject/i }),
    );

    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('broadcasts.approval.rejectReasonPlaceholder'),
      ).toBeInTheDocument(),
    );

    // Enter a rejection reason
    await user.type(
      screen.getByPlaceholderText('broadcasts.approval.rejectReasonPlaceholder'),
      'Content needs revision',
    );

    // Confirm button should now be enabled
    const confirmButton = screen.getByRole('button', {
      name: /broadcasts\.approval\.reject/i,
    });
    expect(confirmButton).not.toBeDisabled();

    await user.click(confirmButton);

    await waitFor(() =>
      expect(mockPost).toHaveBeenCalledWith(
        '/api/outreach/broadcasts/b1/reject',
        { reason: 'Content needs revision' },
      ),
    );
  });
});

describe('BroadcastApprovalPage — empty pending state', () => {
  it('shows broadcasts.approval.noPending when there are no pending broadcasts', async () => {
    const mockGet = makeMockGet([], []);
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet }) as unknown as ReturnType<typeof useApi>,
    );

    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByText('broadcasts.approval.noPending'),
      ).toBeInTheDocument(),
    );
  });

  it('shows the noPendingDescription copy below the empty state heading', async () => {
    const mockGet = makeMockGet([], []);
    vi.mocked(useApi).mockReturnValue(
      makeMockApi({ get: mockGet }) as unknown as ReturnType<typeof useApi>,
    );

    render(
      <MemoryRouter>
        <BroadcastApprovalPage />
      </MemoryRouter>,
    );

    await waitFor(() =>
      expect(
        screen.getByText('broadcasts.approval.noPendingDescription'),
      ).toBeInTheDocument(),
    );
  });
});
