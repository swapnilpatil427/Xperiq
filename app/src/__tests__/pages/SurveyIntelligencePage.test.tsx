import React from 'react';
import { render, screen, waitFor, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: (p: React.ComponentProps<'div'>) => <div {...p} />,
    section: (p: React.ComponentProps<'section'>) => <section {...p} />,
    footer: (p: React.ComponentProps<'footer'>) => <footer {...p} />,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return {
    ...actual,
    useParams: () => ({ surveyId: 'survey1' }),
    useNavigate: () => vi.fn(),
  };
});

vi.mock('../../hooks/useApi', () => ({ useApi: vi.fn(), default: vi.fn() }));
vi.mock('../../hooks/useSurveys', () => ({ useSurveys: vi.fn() }));
vi.mock('../../hooks/useInsights', () => ({ useInsights: vi.fn() }));
vi.mock('../../hooks/useSetPageTitle', () => ({ useSetPageTitle: vi.fn() }));

const mockOpenCrystal = vi.fn();
const mockSetCrystalScope = vi.fn();
const mockSetCrystalData = vi.fn();
vi.mock('../../contexts/crystalPanel', () => ({
  useCrystalPanel: () => ({
    openCrystal: mockOpenCrystal,
    setScope: mockSetCrystalScope,
    setCrystalData: mockSetCrystalData,
  }),
}));

vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));

vi.mock('../../pages/insights/shared', () => ({
  GlassCard: ({ children, className, style }: React.ComponentProps<'div'>) => (
    <div className={className} style={style}>{children}</div>
  ),
  CitationChip: ({ id }: { id: string }) => <span data-testid={`citation-${id}`}>{id}</span>,
  ConfidenceChip: ({ value }: { value: number }) => <span data-testid="confidence-chip">{value}</span>,
  CIBar: ({ position }: { position: number }) => <div data-testid="ci-bar" aria-label={String(position)} />,
  LayerBadge: ({ layer }: { layer: string }) => <span data-testid={`layer-badge-${layer}`}>{layer}</span>,
  LiveDot: ({ color }: { color: string }) => <span data-testid="live-dot" style={{ color }} />,
  LAYER_CONFIG: {
    descriptive:  { color: '#2a4bd9', bg: '#eef2ff' },
    diagnostic:   { color: '#8329c8', bg: '#f3e8ff' },
    predictive:   { color: '#d97706', bg: '#fef3c7' },
    prescriptive: { color: '#059669', bg: '#ecfdf5' },
  },
  SENTIMENT_BORDER: { positive: '#16a34a', negative: '#dc2626', neutral: '#94a3b8', mixed: '#d97706' },
}));

vi.mock('../../pages/insights/GeneratingOverlay', () => ({
  GeneratingOverlay: ({ generating }: { generating: boolean }) => (
    generating ? <div data-testid="generating-overlay">Generating...</div> : null
  ),
}));

vi.mock('../../components/insights/ProgressArc', () => ({
  ProgressArc: ({ tier }: { tier: string }) => <div data-testid={`progress-arc-${tier}`} />,
}));

vi.mock('../../lib/utils', () => ({
  stripCitationRefs: (s: string) => s,
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

import { useApi } from '../../hooks/useApi';
import { useSurveys } from '../../hooks/useSurveys';
import { useInsights } from '../../hooks/useInsights';
import { SurveyIntelligencePage } from '../../pages/experience/SurveyIntelligencePage';

const mockSurvey = {
  id: 'survey1',
  title: 'Customer NPS Survey',
  status: 'active',
  response_count: 120,
  nps_score: 42,
  deleted_at: null,
  updated_at: '2026-06-20T00:00:00Z',
  sparkline: [38, 40, 41, 42, 43, 42, 44],
};

const mockInsight = {
  id: 'ins1',
  headline: 'Checkout friction is driving churn',
  layer: 'diagnostic' as const,
  category: 'voice.topic',
  priority: 90,
  trust_score: 82,
  narrative: 'Users are abandoning at the payment step due to complexity.',
  citations_json: [
    { response_id: 'r1', quote: 'Too many steps at checkout', sentiment: 'negative' },
  ],
  recommended_action: { label: 'Simplify checkout flow', target: 'Engineering', time_horizon: 'short_term', priority: 'high', estimated_impact: '+5 NPS' },
  user_state_json: {},
  generated_at: '2026-06-21T10:00:00Z',
  metric_json: { dominant_sentiment: 'negative' },
  audit_json: { verifier_pass: true, verifier_notes: 'Verified via sampling.', model: 'claude-3' },
  trust_json: { coverage: 85, consistency: 90, statistical: 4.2, grounding: 4.0, sample_size: 120 },
};

const mockNpsInsight = {
  id: 'ins-nps',
  headline: 'NPS score is +42',
  layer: 'descriptive' as const,
  category: 'metric.nps',
  priority: 100,
  trust_score: 95,
  narrative: 'NPS is 42 based on 120 responses.',
  citations_json: [],
  recommended_action: null,
  user_state_json: {},
  generated_at: '2026-06-21T10:00:00Z',
  metric_json: { value: 42 },
  audit_json: null,
  trust_json: null,
};

const mockAnomalyTopic = {
  id: 'tp1',
  name: 'Wait Time',
  trending: 'up',
  sentiment_score: -0.6,
  volume: 32,
  effort_score: 3.8,
};

function buildApiMock(overrides: Record<string, unknown> = {}) {
  return {
    listInsights: vi.fn().mockResolvedValue({
      insights: [mockInsight, mockNpsInsight],
      crystal_opening: 'Strong momentum with some friction points.',
    }),
    listTopics: vi.fn().mockResolvedValue({ topics: [] }),
    getOrgProfile: vi.fn().mockResolvedValue({ profile: { industry: 'technology' } }),
    triggerInsightGeneration: vi.fn().mockResolvedValue({}),
    getInsightRunStatus: vi.fn().mockResolvedValue({ status: 'running', stream_events: [] }),
    updateInsightFeedback: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

function buildSurveysMock(surveys = [mockSurvey], loading = false) {
  return {
    surveys,
    loading,
    error: null,
    createSurvey: vi.fn(),
    updateSurvey: vi.fn(),
    deleteSurvey: vi.fn(),
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useSurveys>;
}

beforeEach(() => {
  mockOpenCrystal.mockClear();
  mockSetCrystalScope.mockClear();
  mockSetCrystalData.mockClear();
  vi.mocked(useApi).mockReturnValue(buildApiMock());
  vi.mocked(useSurveys).mockReturnValue(buildSurveysMock());
  vi.mocked(useInsights).mockReturnValue({
    insights: null,
    loading: false,
    generating: false,
    error: null,
    generate: vi.fn(),
  } as unknown as ReturnType<typeof useInsights>);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><SurveyIntelligencePage /></MemoryRouter>);
}

describe('SurveyIntelligencePage', () => {
  it('renders sticky command strip with survey title', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Customer NPS Survey')).toBeInTheDocument(),
    );
  });

  it('renders responses KPI chip in command strip', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('experience.common.responses')).toBeInTheDocument(),
    );
    // Response count shown
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('renders sub-nav links: Intelligence, Topics, Advanced, Trends, Report', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('experience.nav.intelligence')).toBeInTheDocument(),
    );
    expect(screen.getByText('experience.nav.topics')).toBeInTheDocument();
    expect(screen.getByText('experience.nav.advanced')).toBeInTheDocument();
    expect(screen.getByText('experience.nav.trends')).toBeInTheDocument();
    expect(screen.getByText('experience.nav.report')).toBeInTheDocument();
  });

  it('"Regenerate" button calls api.triggerInsightGeneration(surveyId)', async () => {
    const user = userEvent.setup();
    const mockTrigger = vi.fn().mockResolvedValue({});
    // Mock getInsightRunStatus to return completed quickly so generating stops
    const mockStatus = vi.fn().mockResolvedValue({ status: 'completed', stream_events: [] });
    vi.mocked(useApi).mockReturnValue(buildApiMock({
      triggerInsightGeneration: mockTrigger,
      getInsightRunStatus: mockStatus,
    }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('experience.intelligence.generate.button')).toBeInTheDocument(),
    );
    const regenBtn = screen.getByRole('button', { name: /experience\.intelligence\.generate\.button/i });
    await user.click(regenBtn);
    expect(mockTrigger).toHaveBeenCalledWith('survey1');
  });

  it('pipeline generating overlay shown while generating', async () => {
    const user = userEvent.setup();
    // Keep in a pending generating state
    const mockTrigger = vi.fn().mockResolvedValue({});
    const mockStatus = vi.fn().mockResolvedValue({ status: 'running', stream_events: [] });
    vi.mocked(useApi).mockReturnValue(buildApiMock({
      triggerInsightGeneration: mockTrigger,
      getInsightRunStatus: mockStatus,
    }));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('experience.intelligence.generate.button')).toBeInTheDocument(),
    );
    const regenBtn = screen.getByRole('button', { name: /experience\.intelligence\.generate\.button/i });
    await user.click(regenBtn);
    await waitFor(() =>
      expect(screen.getByTestId('generating-overlay')).toBeInTheDocument(),
    );
  });

  it('renders insight cards with headline, layer badge, and reliability badge', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('Checkout friction is driving churn').length).toBeGreaterThan(0),
    );
    // Layer badge text (t('surveyInsights.layers.diagnostic.label') → returns key)
    expect(screen.getAllByText('surveyInsights.layers.diagnostic.label').length).toBeGreaterThan(0);
    // Reliability badge: trust_score=82 → "reliable"
    expect(screen.getAllByText('experience.insightGrid.reliable').length).toBeGreaterThan(0);
  });

  it('featured insight card is rendered with the gradient background style', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('experience.insightGrid.featuredLabel')).toBeInTheDocument(),
    );
  });

  it('thumbs-up feedback click calls api.updateInsightFeedback', async () => {
    const user = userEvent.setup();
    const mockUpdateFeedback = vi.fn().mockResolvedValue({});
    // Re-use beforeEach mock but override updateInsightFeedback
    vi.mocked(useApi).mockReturnValue({
      ...buildApiMock(),
      updateInsightFeedback: mockUpdateFeedback,
    } as unknown as ReturnType<typeof useApi>);
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('Checkout friction is driving churn').length).toBeGreaterThan(0),
    );
    // There may be multiple "Helpful" buttons (one per insight card); click the first
    const helpfulBtns = screen.getAllByRole('button', { name: /experience\.insightGrid\.helpful/i });
    expect(helpfulBtns.length).toBeGreaterThan(0);
    await user.click(helpfulBtns[0]);
    await waitFor(() => expect(mockUpdateFeedback).toHaveBeenCalled());
    const [, calledPayload] = mockUpdateFeedback.mock.calls[0];
    expect(calledPayload).toHaveProperty('thumbs');
  });

  it('anomaly alert renders when anomaly topic is present', async () => {
    vi.mocked(useApi).mockReturnValue(
      buildApiMock({
        listTopics: vi.fn().mockResolvedValue({ topics: [mockAnomalyTopic] }),
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Wait Time/)).toBeInTheDocument(),
    );
    // The anomaly alert renders the rising warning
    expect(screen.getByText('insights.anomalyRising')).toBeInTheDocument();
  });

  it('dismissing anomaly alert removes it from the DOM', async () => {
    const user = userEvent.setup();
    vi.mocked(useApi).mockReturnValue(
      buildApiMock({
        listTopics: vi.fn().mockResolvedValue({ topics: [mockAnomalyTopic] }),
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText(/Wait Time/)).toBeInTheDocument(),
    );
    const dismissBtn = screen.getByRole('button', { name: /Dismiss/i });
    await user.click(dismissBtn);
    await waitFor(() =>
      expect(screen.queryByText(/Wait Time/)).not.toBeInTheDocument(),
    );
  });

  it('industry nudge renders when orgIndustry is null', async () => {
    vi.mocked(useApi).mockReturnValue(
      buildApiMock({
        getOrgProfile: vi.fn().mockResolvedValue({ profile: { industry: null } }),
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('insights.industryNudgeTitle')).toBeInTheDocument(),
    );
  });

  it('dismissing industry nudge hides it', async () => {
    const user = userEvent.setup();
    vi.mocked(useApi).mockReturnValue(
      buildApiMock({
        getOrgProfile: vi.fn().mockResolvedValue({ profile: { industry: null } }),
      }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('insights.industryNudgeTitle')).toBeInTheDocument(),
    );
    // Click the close/dismiss button on the nudge
    const allDismissBtns = screen.getAllByRole('button', { name: /Dismiss/i });
    await user.click(allDismissBtns[0]);
    await waitFor(() =>
      expect(screen.queryByText('insights.industryNudgeTitle')).not.toBeInTheDocument(),
    );
  });

  it('survey not found: shows guard message when survey does not exist', async () => {
    vi.mocked(useSurveys).mockReturnValue(buildSurveysMock([], false));
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('experience.intelligence.notFound.title')).toBeInTheDocument(),
    );
  });

  it('scopes Crystal to surveyId on mount', async () => {
    renderPage();
    await waitFor(() => expect(mockSetCrystalScope).toHaveBeenCalledWith('survey1'));
  });

  it('"Ask Crystal" on insight card opens crystal panel with insight headline', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getAllByText('Checkout friction is driving churn').length).toBeGreaterThan(0),
    );
    // Click the first "Ask Crystal" button (may appear in featured card + grid card)
    const askCrystalBtns = screen.getAllByRole('button', { name: /experience\.insightGrid\.askCrystal/i });
    await user.click(askCrystalBtns[0]);
    expect(mockOpenCrystal).toHaveBeenCalled();
    expect(mockOpenCrystal.mock.calls[0][0]).toBe('Checkout friction is driving churn');
  });
});
