import React from 'react';
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
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: vi.fn() };
});

// ── ReactFlow mock ─────────────────────────────────────────────────────────────
// useNodesState uses real React state so that setNodes triggers re-renders and
// the component's `nodes` variable is always up to date when save() runs.
// We record every setNodes call in mockSetNodes so tests can inspect it.
const mockSetNodes = vi.fn();
const mockSetEdges = vi.fn();

vi.mock('reactflow', () => {
  // Capture React in the factory; vi.mock hoisting means we can't use the
  // outer import, so we require it inside the factory.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react') as typeof import('react');

  function useNodesStateImpl(initial: unknown[]) {
    const [nodes, setNodesReal] = R.useState<unknown[]>(initial ?? []);
    const setNodes = R.useCallback((updater: unknown) => {
      setNodesReal((prev) => {
        const next = typeof updater === 'function'
          ? (updater as (p: unknown[]) => unknown[])(prev)
          : (updater as unknown[]);
        mockSetNodes(next);
        return next;
      });
    }, []);
    return [nodes, setNodes, vi.fn()];
  }

  function useEdgesStateImpl(initial: unknown[]) {
    const [edges, setEdgesReal] = R.useState<unknown[]>(initial ?? []);
    const setEdges = R.useCallback((updater: unknown) => {
      setEdgesReal((prev) => {
        const next = typeof updater === 'function'
          ? (updater as (p: unknown[]) => unknown[])(prev)
          : (updater as unknown[]);
        mockSetEdges(next);
        return next;
      });
    }, []);
    return [edges, setEdges, vi.fn()];
  }

  return {
    default:       ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
    ReactFlow:     ({ children }: { children?: React.ReactNode }) => <div data-testid="react-flow">{children}</div>,
    Background:    () => null,
    Controls:      () => null,
    MiniMap:       () => null,
    Handle:        () => null,
    Position:      { Left: 'left', Right: 'right', Bottom: 'bottom', Top: 'top' },
    MarkerType:    { ArrowClosed: 'arrowclosed' },
    addEdge:       vi.fn((edge: unknown, edges: unknown[]) => [...edges, edge]),
    useNodesState: useNodesStateImpl,
    useEdgesState: useEdgesStateImpl,
  };
});

// Also stub the CSS import so jsdom doesn't choke on it
vi.mock('reactflow/dist/style.css', () => ({}));

// ── imports after mocks ────────────────────────────────────────────────────────
import { useApi } from '../../hooks/useApi';
import { useNavigate } from 'react-router-dom';
import { WorkflowCanvasPage } from '../../pages/WorkflowCanvasPage';
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
  conditionOperators: ['eq', 'lte', 'gte'],
};

function makeApi(overrides = {}) {
  return {
    getWorkflowRegistry: vi.fn().mockResolvedValue(REGISTRY),
    createGraphWorkflow: vi.fn().mockResolvedValue({ id: 'canvas_wf_1' }),
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
  render(<MemoryRouter><WorkflowCanvasPage /></MemoryRouter>);
}

// ── tests ──────────────────────────────────────────────────────────────────────
describe('WorkflowCanvasPage — canvas mount', () => {
  it('renders the mocked ReactFlow component', () => {
    renderPage();
    expect(screen.getByTestId('react-flow')).toBeInTheDocument();
  });

  it('renders the page title heading', () => {
    renderPage();
    expect(screen.getByText('workflows.canvas.title')).toBeInTheDocument();
  });
});

describe('WorkflowCanvasPage — initial state', () => {
  it('seeds one TriggerNode into the canvas state after registry loads', async () => {
    renderPage();
    await waitFor(() => expect(mockSetNodes).toHaveBeenCalled());
    // Last call passes the seeded trigger node array
    const lastCallArg = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0] as Array<{ data: { kind: string } }>;
    expect(Array.isArray(lastCallArg)).toBe(true);
    const triggerNodes = lastCallArg.filter((n) => n.data?.kind === 'trigger');
    expect(triggerNodes).toHaveLength(1);
  });

  it('name input starts empty', () => {
    renderPage();
    expect(screen.getByPlaceholderText('workflows.builder.namePlaceholder')).toHaveValue('');
  });
});

describe('WorkflowCanvasPage — toolbar buttons', () => {
  it('renders the "+ Condition" toolbar button', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /workflows\.canvas\.addCondition/i })).toBeInTheDocument(),
    );
  });

  it('renders the "+ Action" toolbar button', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /workflows\.canvas\.addAction/i })).toBeInTheDocument(),
    );
  });

  it('clicking "+ Condition" calls setNodes to add a ConditionNode', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /workflows\.canvas\.addCondition/i }));
    mockSetNodes.mockClear();
    await user.click(screen.getByRole('button', { name: /workflows\.canvas\.addCondition/i }));
    await waitFor(() => expect(mockSetNodes).toHaveBeenCalled());
    const lastArg = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0] as Array<{ data: { kind: string } }>;
    expect(lastArg.filter((n) => n.data?.kind === 'condition').length).toBeGreaterThanOrEqual(1);
  });

  it('clicking "+ Action" calls setNodes to add an ActionNode', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => screen.getByRole('button', { name: /workflows\.canvas\.addAction/i }));
    mockSetNodes.mockClear();
    await user.click(screen.getByRole('button', { name: /workflows\.canvas\.addAction/i }));
    await waitFor(() => expect(mockSetNodes).toHaveBeenCalled());
    const lastArg = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0] as Array<{ data: { kind: string } }>;
    expect(lastArg.filter((n) => n.data?.kind === 'action').length).toBeGreaterThanOrEqual(1);
  });
});

describe('WorkflowCanvasPage — workflow name input', () => {
  it('accepts text input in the name field', async () => {
    const user = userEvent.setup();
    renderPage();
    const nameInput = screen.getByPlaceholderText('workflows.builder.namePlaceholder');
    await user.type(nameInput, 'Canvas Flow');
    expect(nameInput).toHaveValue('Canvas Flow');
  });
});

describe('WorkflowCanvasPage — save validation', () => {
  it('shows an error when saving with empty name', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /workflows\.builder\.save/i }));
    await waitFor(() =>
      expect(screen.getByText('workflows.builder.incomplete')).toBeInTheDocument(),
    );
  });

  it('shows an error when saving with name but no action nodes', async () => {
    // Override registry to return no triggers so no trigger node is seeded and no action
    vi.mocked(useApi).mockReturnValue(
      makeApi({
        getWorkflowRegistry: vi.fn().mockResolvedValue({ ...REGISTRY, triggers: [] }),
      }) as unknown as ReturnType<typeof useApi>,
    );
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByPlaceholderText('workflows.builder.namePlaceholder'), 'Orphan Flow');
    await user.click(screen.getByRole('button', { name: /workflows\.builder\.save/i }));
    await waitFor(() =>
      expect(screen.getByText('workflows.builder.incomplete')).toBeInTheDocument(),
    );
  });
});

describe('WorkflowCanvasPage — save success', () => {
  it('calls createGraphWorkflow and navigates to ROUTES.WORKFLOWS when trigger + action exist', async () => {
    const createGraphWorkflow = vi.fn().mockResolvedValue({ id: 'canvas_wf_1' });
    vi.mocked(useApi).mockReturnValue(
      makeApi({ createGraphWorkflow }) as unknown as ReturnType<typeof useApi>,
    );

    const user = userEvent.setup();
    renderPage();

    // Wait for registry to load and trigger node to be seeded into state
    await waitFor(() => expect(mockSetNodes).toHaveBeenCalled());

    // Add an action node via the toolbar button — this updates real React state
    await user.click(screen.getByRole('button', { name: /workflows\.canvas\.addAction/i }));

    // Verify setNodes was called with an action node (state is now trigger + action)
    await waitFor(() => {
      const lastArg = mockSetNodes.mock.calls[mockSetNodes.mock.calls.length - 1][0] as Array<{ data: { kind: string } }>;
      expect(lastArg.some((n) => n.data?.kind === 'action')).toBe(true);
    });

    // Type the workflow name
    await user.type(screen.getByPlaceholderText('workflows.builder.namePlaceholder'), 'Canvas Automation');

    // Click Save
    await user.click(screen.getByRole('button', { name: /workflows\.builder\.save/i }));

    await waitFor(() => expect(createGraphWorkflow).toHaveBeenCalledOnce());
    expect(createGraphWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        name:        'Canvas Automation',
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
