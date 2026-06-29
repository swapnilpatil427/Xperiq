import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── mocks (must be at top, before component imports) ──────────────────────────
vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
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
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) =>
      <div {...props}>{children}</div>,
  },
}));
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

// ── imports after mocks ────────────────────────────────────────────────────────
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import { WorkflowBuilderPage } from '../../pages/WorkflowBuilderPage';
import { ROUTES } from '../../constants/routes';

// ── fixtures ───────────────────────────────────────────────────────────────────
const mockNavigate = vi.fn();

const REGISTRY = {
  triggers: [
    { type: 'survey.response_filtered', label: 'New Response (filtered)', category: 'Survey' },
    { type: 'survey.nps_drop',          label: 'NPS Drop',                category: 'Metrics' },
  ],
  actions: [
    { action: 'notify.in_app', label: 'In-App Notification', category: 'Notify', live: true },
    { action: 'notify.slack',  label: 'Slack Message',       category: 'Notify', live: false },
  ],
  conditionOperators: ['eq', 'neq', 'lte', 'gte'],
};

function makeApi(overrides = {}) {
  return {
    getWorkflowRegistry:  vi.fn().mockResolvedValue(REGISTRY),
    createGraphWorkflow:  vi.fn().mockResolvedValue({ id: 'wf_new' }),
    ...overrides,
  };
}

// ── setup / teardown ───────────────────────────────────────────────────────────
beforeEach(() => {
  vi.mocked(useNavigate).mockReturnValue(mockNavigate);
  vi.mocked(useApi).mockReturnValue(makeApi() as unknown as ReturnType<typeof useApi>);
});

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// ── helpers ────────────────────────────────────────────────────────────────────
function renderPage() {
  render(<MemoryRouter><WorkflowBuilderPage /></MemoryRouter>);
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('WorkflowBuilderPage — page structure', () => {
  it('renders the page title heading', () => {
    renderPage();
    expect(screen.getByText('workflows.builder.title')).toBeInTheDocument();
  });

  it('renders three step-card headings: Trigger, Conditions, Actions', async () => {
    renderPage();
    // The NodeCard headers use translation keys
    await waitFor(() => {
      expect(screen.getByText('workflows.builder.whenTrigger')).toBeInTheDocument();
      expect(screen.getByText('workflows.builder.ifConditions')).toBeInTheDocument();
      expect(screen.getByText('workflows.builder.thenActions')).toBeInTheDocument();
    });
  });

  it('renders the workflow name input', () => {
    renderPage();
    expect(screen.getByLabelText('workflows.builder.nameLabel')).toBeInTheDocument();
  });
});

describe('WorkflowBuilderPage — registry loading', () => {
  it('populates the trigger select with the first registry trigger type after load', async () => {
    renderPage();
    // After the registry loads, the component calls setTriggerType with the first trigger.
    // The SelectTrigger button shows the currently-selected value.
    // Wait for the select trigger button to appear (it has aria-expanded)
    await waitFor(() => {
      expect(screen.getByText(/New Response \(filtered\)/)).toBeInTheDocument();
    });
  });
});

describe('WorkflowBuilderPage — name input', () => {
  it('allows typing a workflow name', async () => {
    const user = userEvent.setup();
    renderPage();
    const nameInput = screen.getByLabelText('workflows.builder.nameLabel');
    await user.type(nameInput, 'My Test Workflow');
    expect(nameInput).toHaveValue('My Test Workflow');
  });
});

describe('WorkflowBuilderPage — conditions', () => {
  it('clicking "+ Add Condition" adds a condition row', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('workflows.builder.addCondition'));
    await user.click(screen.getByText('workflows.builder.addCondition'));
    // A condition row contains a field input with placeholder "field (e.g. nps)"
    expect(screen.getByPlaceholderText('field (e.g. nps)')).toBeInTheDocument();
  });

  it('clicking "+ Add Condition" twice adds two rows', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('workflows.builder.addCondition'));
    const addBtn = screen.getByText('workflows.builder.addCondition');
    await user.click(addBtn);
    await user.click(addBtn);
    expect(screen.getAllByPlaceholderText('field (e.g. nps)')).toHaveLength(2);
  });

  it('condition row includes field, op, and value inputs', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('workflows.builder.addCondition'));
    await user.click(screen.getByText('workflows.builder.addCondition'));
    expect(screen.getByPlaceholderText('field (e.g. nps)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('value')).toBeInTheDocument();
  });

  it('clicking the close button on a condition row removes it', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('workflows.builder.addCondition'));
    await user.click(screen.getByText('workflows.builder.addCondition'));
    // There should now be one field input
    expect(screen.getByPlaceholderText('field (e.g. nps)')).toBeInTheDocument();
    // The condition row is a flex div containing: field input, select, value input, close button.
    // Walk up from the field placeholder input to its flex row, then get the last button (close).
    const fieldInput = screen.getByPlaceholderText('field (e.g. nps)');
    const rowDiv = fieldInput.parentElement as HTMLElement; // div.flex.items-center.gap-2.mb-2
    expect(rowDiv).toBeTruthy();
    const buttons = rowDiv.querySelectorAll('button');
    // The only button in the condition row is the ghost close button
    expect(buttons.length).toBeGreaterThan(0);
    await user.click(buttons[buttons.length - 1]);
    expect(screen.queryByPlaceholderText('field (e.g. nps)')).not.toBeInTheDocument();
  });
});

describe('WorkflowBuilderPage — actions', () => {
  it('clicking "+ Add Action" adds an action select', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('workflows.builder.addAction'));
    await user.click(screen.getByText('workflows.builder.addAction'));
    // After adding an action, the action select options from registry should be present
    await waitFor(() =>
      expect(screen.getByText('In-App Notification')).toBeInTheDocument(),
    );
  });

  it('clicking "+ Add Action" twice adds two action selects', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('workflows.builder.addAction'));
    const addBtn = screen.getByText('workflows.builder.addAction');
    await user.click(addBtn);
    await user.click(addBtn);
    // Two action rows each show a Badge with their 1-based index
    // getAllByText returns all matches — we just need at least one "1" badge and one "2" badge
    // The NodeCard step number "3" also appears, so filter for badge elements specifically
    const badges = document.querySelectorAll('.inline-flex.items-center'); // Badge base class
    const badgeTexts = Array.from(badges).map((b) => b.textContent?.trim());
    expect(badgeTexts).toContain('1');
    expect(badgeTexts).toContain('2');
  });

  it('clicking the close button on an action removes it', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('workflows.builder.addAction'));
    await user.click(screen.getByText('workflows.builder.addAction'));
    // After adding, the action row exists in the DOM.
    // The action row is: div.flex.items-center.gap-2.mb-2 inside the actions NodeCard.
    const addActionBtn = screen.getByText('workflows.builder.addAction').closest('button') as HTMLElement;
    const actionsCard = addActionBtn.closest('div.p-5') as HTMLElement;
    await waitFor(() => {
      const actionRows = actionsCard.querySelectorAll('div.flex.items-center.gap-2.mb-2');
      expect(actionRows.length).toBe(1);
    });
    const actionRows = actionsCard.querySelectorAll('div.flex.items-center.gap-2.mb-2');
    // The close ghost button is the last button in the action row
    const allBtns = actionRows[0].querySelectorAll('button');
    const closeBtn = allBtns[allBtns.length - 1] as HTMLElement;
    expect(closeBtn).toBeTruthy();
    await user.click(closeBtn);
    // After deletion the action row is removed
    await waitFor(() => {
      const remaining = actionsCard.querySelectorAll('div.flex.items-center.gap-2.mb-2');
      expect(remaining.length).toBe(0);
    });
  });
});

describe('WorkflowBuilderPage — validation', () => {
  it('shows an error when saving with empty name', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByText('workflows.builder.save'));
    await user.click(screen.getByRole('button', { name: /workflows\.builder\.save/i }));
    await waitFor(() =>
      expect(screen.getByText('workflows.builder.incomplete')).toBeInTheDocument(),
    );
  });

  it('shows an error when saving with name but no actions', async () => {
    const user = userEvent.setup();
    renderPage();
    const nameInput = screen.getByLabelText('workflows.builder.nameLabel');
    await user.type(nameInput, 'My Workflow');
    await user.click(screen.getByRole('button', { name: /workflows\.builder\.save/i }));
    await waitFor(() =>
      expect(screen.getByText('workflows.builder.incomplete')).toBeInTheDocument(),
    );
  });
});

describe('WorkflowBuilderPage — save flow', () => {
  it('calls createGraphWorkflow with name, triggerType, nodes, edges, status:draft and navigates to ROUTES.WORKFLOWS', async () => {
    const createGraphWorkflow = vi.fn().mockResolvedValue({ id: 'wf_new' });
    vi.mocked(useApi).mockReturnValue(
      makeApi({ createGraphWorkflow }) as unknown as ReturnType<typeof useApi>,
    );
    const user = userEvent.setup();
    renderPage();

    // Wait for registry to load
    await waitFor(() => screen.getByText('workflows.builder.addAction'));

    // Enter a name
    await user.type(screen.getByLabelText('workflows.builder.nameLabel'), 'My Automation');

    // Add one action (trigger is auto-selected from registry)
    await user.click(screen.getByText('workflows.builder.addAction'));

    // Save
    await user.click(screen.getByRole('button', { name: /workflows\.builder\.save/i }));

    await waitFor(() => expect(createGraphWorkflow).toHaveBeenCalledOnce());
    expect(createGraphWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name:        'My Automation',
        triggerType: 'survey.response_filtered',
        status:      'draft',
        nodes:       expect.arrayContaining([
          expect.objectContaining({ type: 'trigger' }),
          expect.objectContaining({ type: 'action' }),
        ]),
        edges: expect.any(Array),
      }),
    );
    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith(ROUTES.WORKFLOWS));
  });
});
