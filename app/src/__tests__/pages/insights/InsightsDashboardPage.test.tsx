import { render, screen, act, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// ── Stable mock refs (hoisted so vi.mock factories can reference them) ────────

const { mockT, mockSetCrystalData, mockSetScope, mockOpenCrystal } = vi.hoisted(() => ({
  mockT:              vi.fn((k: string) => k),
  mockSetCrystalData: vi.fn(),
  mockSetScope:       vi.fn(),
  mockOpenCrystal:    vi.fn(),
}));

// ── Mocks (must precede page import) ─────────────────────────────────────────

vi.mock('../../../hooks/useApi',     () => ({ useApi:      vi.fn() }));
vi.mock('../../../hooks/useSurveys', () => ({ useSurveys:  vi.fn() }));
vi.mock('../../../hooks/useInsights',() => ({ useInsights: vi.fn() }));
vi.mock('../../../contexts/crystalPanel', () => ({
  useCrystalPanel: () => ({
    setScope:       mockSetScope,
    openCrystal:    mockOpenCrystal,
    setCrystalData: mockSetCrystalData,
  }),
}));
vi.mock('../../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));
vi.mock('../../../lib/i18n', () => ({
  useTranslation: () => ({ t: mockT }),
}));
vi.mock('framer-motion', () => ({
  motion: {
    div:    ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>)    => <div    {...p}>{children}</div>,
    button: ({ children, ...p }: React.HTMLAttributes<HTMLButtonElement>) => <button {...p}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('../../../pages/insights/UnifiedInsightsView', () => ({
  UnifiedInsightsView: ({ genError, generating }: { genError?: string | null; generating?: boolean }) => (
    <div data-testid="unified-view">
      {generating && <span>sentinel-generating</span>}
      {genError   && <span data-testid="gen-error">{genError}</span>}
    </div>
  ),
}));
vi.mock('../../../components/SurveyScopePicker', () => ({
  SurveyScopePicker: () => <div />,
}));
vi.mock('../../../components/PageHeader', () => ({
  PageHeader: ({ actions }: { actions?: React.ReactNode }) => <div data-testid="page-header">{actions}</div>,
}));

import { useApi }      from '../../../hooks/useApi';
import { useSurveys }  from '../../../hooks/useSurveys';
import { useInsights } from '../../../hooks/useInsights';
import { InsightsDashboardPage } from '../../../pages/InsightsDashboardPage';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SURVEY = {
  id: 's1', title: 'Q1 NPS', status: 'active' as const,
  survey_type_id: 'nps', response_count: 50,
  updated_at: new Date().toISOString(), created_at: new Date().toISOString(),
  questions: [], tags: [], sparkline: [],
};

function buildApi(overrides: Record<string, unknown> = {}) {
  return {
    listInsights:             vi.fn().mockResolvedValue({ insights: [] }),
    triggerInsightGeneration: vi.fn().mockResolvedValue({}),
    getInsightRunStatus:      vi.fn().mockResolvedValue({ status: 'running', stream_events: [] }),
    listTopics:               vi.fn().mockResolvedValue({ topics: [] }),
    getOrgAnalytics:          vi.fn().mockResolvedValue({ avg_nps: null }),
    getOrgProfile:            vi.fn().mockResolvedValue({ profile: { industry: 'tech' } }),
    ...overrides,
  };
}

function setupMocks(apiOverrides: Record<string, unknown> = {}) {
  const api = buildApi(apiOverrides);
  vi.mocked(useApi).mockReturnValue(api as unknown as ReturnType<typeof useApi>);
  vi.mocked(useSurveys).mockReturnValue({ surveys: [SURVEY], loading: false, error: null } as unknown as ReturnType<typeof useSurveys>);
  vi.mocked(useInsights).mockReturnValue({ insights: [], generating: false, regenerate: vi.fn() } as unknown as ReturnType<typeof useInsights>);
  return api;
}

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/app/insights?survey=s1']}>
      <InsightsDashboardPage />
    </MemoryRouter>,
  );
}

function clickGenerate() {
  fireEvent.click(screen.getByRole('button', { name: /insights\.refreshButton/i }));
}

// ── setInterval capture — no fake timers needed ───────────────────────────────

type IntervalCallback = () => void | Promise<void>;
let capturedIntervals: IntervalCallback[] = [];

beforeEach(() => {
  capturedIntervals = [];
  mockT.mockImplementation((k: string) => k);
  mockSetCrystalData.mockReset();
  vi.spyOn(globalThis, 'setInterval').mockImplementation((fn: unknown) => {
    capturedIntervals.push(fn as IntervalCallback);
    return 999 as unknown as ReturnType<typeof setInterval>;
  });
  vi.spyOn(globalThis, 'clearInterval').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  vi.clearAllMocks();
});

// Call the nth captured setInterval callback `times` times, flushing React each time.
async function tickInterval(index: number, times = 1) {
  const cb = capturedIntervals[index];
  if (!cb) throw new Error(`No interval at index ${index}. Captured: ${capturedIntervals.length}`);
  for (let i = 0; i < times; i++) {
    await act(async () => { await cb(); });
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('InsightsDashboardPage — generate polling', () => {
  it('calls triggerInsightGeneration and shows generating state', async () => {
    const api = setupMocks();
    renderPage();

    await act(async () => { clickGenerate(); });
    await act(async () => {}); // flush triggerInsightGeneration promise

    expect(api.triggerInsightGeneration).toHaveBeenCalledWith('s1');
    expect(screen.getByText('sentinel-generating')).toBeTruthy();
  });

  it('loads insights and clears generating on completed status', async () => {
    const api = setupMocks({
      getInsightRunStatus: vi.fn()
        .mockResolvedValueOnce({ status: 'running',   stream_events: [] })
        .mockResolvedValueOnce({ status: 'completed', stream_events: [] }),
    });
    renderPage();

    await act(async () => { clickGenerate(); });
    await act(async () => {});

    await tickInterval(0); // tick 1: running
    await tickInterval(0); // tick 2: completed → loadAgentic → setGenerating(false)

    expect(api.listInsights).toHaveBeenCalledWith('s1');
    expect(screen.queryByText('sentinel-generating')).toBeNull();
  });

  it('shows errorFailed message when backend reports failed status', async () => {
    setupMocks({
      getInsightRunStatus: vi.fn().mockResolvedValue({ status: 'failed', stream_events: [] }),
    });
    renderPage();

    await act(async () => { clickGenerate(); });
    await act(async () => {});

    await tickInterval(0);

    expect(screen.getByTestId('gen-error')).toHaveTextContent('insights.generate.errorFailed');
    expect(screen.queryByTestId('bg-banner')).toBeNull();
  });

  it('dismisses overlay and shows background banner when elapsed threshold is reached', async () => {
    setupMocks(); // status always 'running'
    renderPage();

    await act(async () => { clickGenerate(); });
    await act(async () => {});

    // elapsed increments 3s per tick; 101 ticks → elapsed=303 ≥ 300 → background mode
    await tickInterval(0, 101);

    expect(screen.queryByText('sentinel-generating')).toBeNull();
    expect(screen.getByTestId('bg-banner')).toBeTruthy();
  });

  it('shows ready toast and hides banner when background poll detects completed', async () => {
    setupMocks();
    renderPage();

    await act(async () => { clickGenerate(); });
    await act(async () => {});

    await tickInterval(0, 101);
    expect(screen.getByTestId('bg-banner')).toBeTruthy();

    // Override to 'completed' for the next background-poll tick
    const api = vi.mocked(useApi)();
    vi.mocked(api.getInsightRunStatus).mockResolvedValueOnce({ status: 'completed', stream_events: [] } as never);

    await tickInterval(1); // bg poll tick

    expect(screen.queryByTestId('bg-banner')).toBeNull();
    expect(screen.getByTestId('ready-toast')).toBeTruthy();
  });

  it('shows errorFailed and clears banner when background poll detects failed', async () => {
    setupMocks();
    renderPage();

    await act(async () => { clickGenerate(); });
    await act(async () => {});

    await tickInterval(0, 101);
    expect(screen.getByTestId('bg-banner')).toBeTruthy();

    const api = vi.mocked(useApi)();
    vi.mocked(api.getInsightRunStatus).mockResolvedValueOnce({ status: 'failed', stream_events: [] } as never);

    await tickInterval(1);

    expect(screen.queryByTestId('bg-banner')).toBeNull();
    expect(screen.getByTestId('gen-error')).toHaveTextContent('insights.generate.errorFailed');
  });

  it('dismisses ready toast when user clicks the close button', async () => {
    setupMocks();
    renderPage();

    await act(async () => { clickGenerate(); });
    await act(async () => {});

    await tickInterval(0, 101);

    const api = vi.mocked(useApi)();
    vi.mocked(api.getInsightRunStatus).mockResolvedValueOnce({ status: 'completed', stream_events: [] } as never);

    await tickInterval(1);
    expect(screen.getByTestId('ready-toast')).toBeTruthy();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /insights\.generate\.dismiss/i }));
    });

    expect(screen.queryByTestId('ready-toast')).toBeNull();
  });
});
