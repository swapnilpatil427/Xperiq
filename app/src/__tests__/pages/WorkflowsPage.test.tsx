import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── mocks (must be at top, before component imports) ──────────────────────────
vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../hooks/useWorkflows', () => ({ useWorkflows: vi.fn() }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({
    t: (k: string) => {
      // Return real arrays for the options the component reads as object arrays
      if (k === 'workflows.conditionOptions') return [
        { label: 'Sentiment = Negative', field: 'sentiment', operator: '=', value: 'Negative' },
        { label: 'NPS Score < 6',        field: 'nps',       operator: '<', value: '6' },
      ];
      if (k === 'workflows.actionOptions') return [
        { label: 'Notify Support Team', type: 'notify', config: { team: 'support' } },
        { label: 'Send Email Digest',   type: 'email',  config: { to: 'team@company.com' } },
      ];
      return k;
    },
  }),
}));
vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('../../components/PageHeader', () => ({
  PageHeader: ({ title, actions }: { title: string; actions?: React.ReactNode }) => (
    <div>
      <h1>{title}</h1>
      <div data-testid="page-header-actions">{actions}</div>
    </div>
  ),
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

// ── imports after mocks ────────────────────────────────────────────────────────
import { useApi } from '../../hooks/useApi';
import { useWorkflows } from '../../hooks/useWorkflows';
import { useNavigate } from 'react-router-dom';
import { WorkflowsPage } from '../../pages/WorkflowsPage';
import { ROUTES } from '../../constants/routes';
import type { Workflow } from '../../types';

// ── fixtures ───────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();

const ACTIVE_WORKFLOW: Workflow = {
  id: 'w1',
  name: 'My Flow',
  condition: { field: 'sentiment', operator: '=', value: 'Negative' },
  action: { type: 'email', config: { to: 'team@company.com' } },
  status: 'active',
  trigger_count: 3,
};

function makeApi(overrides = {}) {
  return {
    listWorkflowApprovals:      vi.fn().mockResolvedValue({ approvals: [] }),
    listWorkflowTemplates:      vi.fn().mockResolvedValue({ templates: [] }),
    createWorkflow:             vi.fn().mockResolvedValue({ workflow: { ...ACTIVE_WORKFLOW, name: 'New Flow' } }),
    decideApproval:             vi.fn().mockResolvedValue({}),
    createWorkflowFromTemplate: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
}

function makeWorkflowsHook(overrides = {}) {
  return {
    workflows:      [] as Workflow[],
    loading:        false,
    createWorkflow: vi.fn().mockResolvedValue(ACTIVE_WORKFLOW),
    toggleWorkflow: vi.fn(),
    deleteWorkflow: vi.fn(),
    reload:         vi.fn(),
    ...overrides,
  };
}

// ── setup / teardown ───────────────────────────────────────────────────────────
beforeEach(() => {
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
  vi.mocked(useWorkflows).mockReturnValue(
    makeWorkflowsHook() as unknown as ReturnType<typeof useWorkflows>,
  );
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── Empty state ────────────────────────────────────────────────────────────────
describe('WorkflowsPage — empty state', () => {
  it('shows the empty-state heading and description when there are no workflows', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('workflows.empty.heading')).toBeInTheDocument());
    expect(screen.getByText('workflows.empty.description')).toBeInTheDocument();
  });

  it('shows a "Get Started" CTA button in the empty state', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'workflows.empty.cta' })).toBeInTheDocument(),
    );
  });

  it('clicking the empty-state CTA opens the new-workflow modal', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: 'workflows.empty.cta' }));
    expect(screen.getByText('workflows.modal.heading')).toBeInTheDocument();
  });
});

// ── Workflow list ─────────────────────────────────────────────────────────────
describe('WorkflowsPage — workflow list', () => {
  beforeEach(() => {
    vi.mocked(useWorkflows).mockReturnValue(
      makeWorkflowsHook({ workflows: [ACTIVE_WORKFLOW] }) as unknown as ReturnType<typeof useWorkflows>,
    );
  });

  it('renders the workflow name as a badge', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('My Flow')).toBeInTheDocument());
  });

  it('renders the trigger count next to the badge', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('3 triggers')).toBeInTheDocument());
  });

  it('shows a Pause button for an active workflow', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /workflows\.controls\.pause/i })).toBeInTheDocument(),
    );
  });

  it('clicking Pause calls toggleWorkflow with the workflow id', async () => {
    const toggleWorkflow = vi.fn();
    vi.mocked(useWorkflows).mockReturnValue(
      makeWorkflowsHook({ workflows: [ACTIVE_WORKFLOW], toggleWorkflow }) as unknown as ReturnType<typeof useWorkflows>,
    );
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /workflows\.controls\.pause/i }));
    expect(toggleWorkflow).toHaveBeenCalledWith('w1');
  });

  it('shows Resume button for a paused workflow', async () => {
    const paused: Workflow = { ...ACTIVE_WORKFLOW, status: 'paused' };
    vi.mocked(useWorkflows).mockReturnValue(
      makeWorkflowsHook({ workflows: [paused] }) as unknown as ReturnType<typeof useWorkflows>,
    );
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /workflows\.controls\.resume/i })).toBeInTheDocument(),
    );
  });

  it('clicking Delete calls deleteWorkflow with the correct id', async () => {
    const deleteWorkflow = vi.fn();
    vi.mocked(useWorkflows).mockReturnValue(
      makeWorkflowsHook({ workflows: [ACTIVE_WORKFLOW], deleteWorkflow }) as unknown as ReturnType<typeof useWorkflows>,
    );
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    // Wait for card to appear, then click the destructive icon button
    await waitFor(() => screen.getByText('My Flow'));
    // The delete button is an icon-only size="icon" variant="destructive" button
    const deleteButtons = screen.getAllByRole('button').filter((btn) => {
      const style = btn.getAttribute('style') || '';
      return style.includes('rgba(180,19,64');
    });
    expect(deleteButtons).toHaveLength(1);
    await user.click(deleteButtons[0]);
    expect(deleteWorkflow).toHaveBeenCalledWith('w1');
  });
});

// ── Toolbar navigation ─────────────────────────────────────────────────────────
describe('WorkflowsPage — toolbar navigation', () => {
  it('"Build Visually" button navigates to ROUTES.WORKFLOW_BUILD', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /workflows\.buildVisually/i }));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.WORKFLOW_BUILD);
  });

  it('"Build on Canvas" button navigates to ROUTES.WORKFLOW_CANVAS', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /workflows\.buildOnCanvas/i }));
    expect(mockNavigate).toHaveBeenCalledWith(ROUTES.WORKFLOW_CANVAS);
  });

  it('"+ New Workflow" button opens the create modal', async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /workflows\.newWorkflowButton/i }));
    expect(screen.getByText('workflows.modal.heading')).toBeInTheDocument();
  });
});

// ── Create modal ──────────────────────────────────────────────────────────────
describe('WorkflowsPage — create modal', () => {
  async function openModal() {
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await user.click(await screen.findByRole('button', { name: /workflows\.newWorkflowButton/i }));
    return user;
  }

  it('Create button is disabled when the name field is empty', async () => {
    await openModal();
    const createBtn = screen.getByRole('button', { name: /workflows\.modal\.createButton/i });
    expect(createBtn).toBeDisabled();
  });

  it('entering a workflow name enables the Create button', async () => {
    const user = await openModal();
    await user.type(
      screen.getByPlaceholderText('workflows.modal.namePlaceholder'),
      'Test Workflow',
    );
    expect(screen.getByRole('button', { name: /workflows\.modal\.createButton/i })).not.toBeDisabled();
  });

  it('Cancel button closes the modal', async () => {
    const user = await openModal();
    await user.click(screen.getByRole('button', { name: /workflows\.modal\.cancelButton/i }));
    expect(screen.queryByText('workflows.modal.heading')).not.toBeInTheDocument();
  });

  it('submitting with a name calls createWorkflow with the correct payload', async () => {
    const createWorkflow = vi.fn().mockResolvedValue(ACTIVE_WORKFLOW);
    vi.mocked(useWorkflows).mockReturnValue(
      makeWorkflowsHook({ createWorkflow }) as unknown as ReturnType<typeof useWorkflows>,
    );
    const user = await openModal();
    await user.type(screen.getByPlaceholderText('workflows.modal.namePlaceholder'), 'New Flow');
    await user.click(screen.getByRole('button', { name: /workflows\.modal\.createButton/i }));
    await waitFor(() => expect(createWorkflow).toHaveBeenCalledOnce());
    expect(createWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'New Flow' }),
    );
  });

  it('modal closes after successful create', async () => {
    const createWorkflow = vi.fn().mockResolvedValue(ACTIVE_WORKFLOW);
    vi.mocked(useWorkflows).mockReturnValue(
      makeWorkflowsHook({ createWorkflow }) as unknown as ReturnType<typeof useWorkflows>,
    );
    const user = await openModal();
    await user.type(screen.getByPlaceholderText('workflows.modal.namePlaceholder'), 'New Flow');
    await user.click(screen.getByRole('button', { name: /workflows\.modal\.createButton/i }));
    await waitFor(() =>
      expect(screen.queryByText('workflows.modal.heading')).not.toBeInTheDocument(),
    );
  });
});

// ── Pending Approvals section ─────────────────────────────────────────────────
describe('WorkflowsPage — Pending Approvals', () => {
  const approval = {
    id: 'appr1',
    execution_id: 'exec1',
    workflow_name: 'Review Alert',
    requested_at: '2026-06-01T10:00:00Z',
  };

  beforeEach(() => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listWorkflowApprovals: vi.fn().mockResolvedValue({ approvals: [approval] }),
      }) as unknown as ReturnType<typeof useApi>,
    );
  });

  it('renders the approval card with the workflow name', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('Review Alert')).toBeInTheDocument());
  });

  it('shows the waiting label on the approval card', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => screen.getByText('Review Alert'));
    expect(screen.getByText('workflows.approvals.waiting')).toBeInTheDocument();
  });

  it('Approve button calls decideApproval(execId, "approve")', async () => {
    const decideApproval = vi.fn().mockResolvedValue({});
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listWorkflowApprovals: vi.fn().mockResolvedValue({ approvals: [approval] }),
        decideApproval,
      }) as unknown as ReturnType<typeof useApi>,
    );
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => screen.getByText('Review Alert'));
    await user.click(screen.getByRole('button', { name: /workflows\.approvals\.approve/i }));
    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith('exec1', 'approve'));
  });

  it('Reject button calls decideApproval(execId, "reject")', async () => {
    const decideApproval = vi.fn().mockResolvedValue({});
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listWorkflowApprovals: vi.fn().mockResolvedValue({ approvals: [approval] }),
        decideApproval,
      }) as unknown as ReturnType<typeof useApi>,
    );
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => screen.getByText('Review Alert'));
    await user.click(screen.getByRole('button', { name: /workflows\.approvals\.reject/i }));
    await waitFor(() => expect(decideApproval).toHaveBeenCalledWith('exec1', 'reject'));
  });

  it('removes the approval card from the list after a decision', async () => {
    const decideApproval = vi.fn().mockResolvedValue({});
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listWorkflowApprovals: vi.fn().mockResolvedValue({ approvals: [approval] }),
        decideApproval,
      }) as unknown as ReturnType<typeof useApi>,
    );
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => screen.getByText('Review Alert'));
    await user.click(screen.getByRole('button', { name: /workflows\.approvals\.approve/i }));
    await waitFor(() => expect(screen.queryByText('Review Alert')).not.toBeInTheDocument());
  });
});

// ── Templates section ─────────────────────────────────────────────────────────
describe('WorkflowsPage — Templates', () => {
  const template = {
    slug: 'nps-alert',
    name: 'NPS Drop Alert',
    description: 'Fires when NPS falls below threshold',
    is_featured: true,
  };

  beforeEach(() => {
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listWorkflowTemplates: vi.fn().mockResolvedValue({ templates: [template] }),
      }) as unknown as ReturnType<typeof useApi>,
    );
  });

  it('renders the template card with name and description', async () => {
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => expect(screen.getByText('NPS Drop Alert')).toBeInTheDocument());
    expect(screen.getByText('Fires when NPS falls below threshold')).toBeInTheDocument();
  });

  it('"Use Template" button calls createWorkflowFromTemplate', async () => {
    const createWorkflowFromTemplate = vi.fn().mockResolvedValue({});
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        listWorkflowTemplates: vi.fn().mockResolvedValue({ templates: [template] }),
        createWorkflowFromTemplate,
      }) as unknown as ReturnType<typeof useApi>,
    );
    const user = userEvent.setup();
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    await waitFor(() => screen.getByText('NPS Drop Alert'));
    await user.click(screen.getByRole('button', { name: /workflows\.useTemplate/i }));
    await waitFor(() =>
      expect(createWorkflowFromTemplate).toHaveBeenCalledWith(template),
    );
  });
});

// ── Loading state ─────────────────────────────────────────────────────────────
describe('WorkflowsPage — loading state', () => {
  it('does not render workflow cards or empty state while loading', () => {
    vi.mocked(useWorkflows).mockReturnValue(
      makeWorkflowsHook({ loading: true, workflows: [] }) as unknown as ReturnType<typeof useWorkflows>,
    );
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    expect(screen.queryByText('workflows.empty.heading')).not.toBeInTheDocument();
    expect(screen.queryByText('My Flow')).not.toBeInTheDocument();
  });
});

// ── Stats row ─────────────────────────────────────────────────────────────────
describe('WorkflowsPage — stats row', () => {
  it('correctly counts active workflows, total triggers, and paused workflows', async () => {
    const workflows: Workflow[] = [
      { ...ACTIVE_WORKFLOW, id: 'a1', status: 'active', trigger_count: 10 },
      { ...ACTIVE_WORKFLOW, id: 'a2', status: 'active', trigger_count: 5  },
      { ...ACTIVE_WORKFLOW, id: 'p1', status: 'paused', trigger_count: 2  },
    ];
    vi.mocked(useWorkflows).mockReturnValue(
      makeWorkflowsHook({ workflows }) as unknown as ReturnType<typeof useWorkflows>,
    );
    render(<MemoryRouter><WorkflowsPage /></MemoryRouter>);
    // Total triggers = 17, active = 2, paused = 1
    await waitFor(() => expect(screen.getByText('17')).toBeInTheDocument());
    expect(screen.getByText('1')).toBeInTheDocument();
    // Active count "2" appears in the stat card
    const twos = screen.getAllByText('2');
    expect(twos.length).toBeGreaterThanOrEqual(1);
  });
});
