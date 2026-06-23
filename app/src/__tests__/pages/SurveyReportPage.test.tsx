import React from 'react';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
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

const mockOpenCrystal = vi.fn();
const mockSetScope = vi.fn();
vi.mock('../../contexts/crystalPanel', () => ({
  useCrystalPanel: () => ({
    openCrystal: mockOpenCrystal,
    setScope: mockSetScope,
    setCrystalData: vi.fn(),
  }),
}));

vi.mock('../../contexts/pageTitle', () => ({ useSetPageTitle: vi.fn() }));

vi.mock('../../pages/insights/shared', () => ({
  GlassCard: ({ children, className, style }: React.ComponentProps<'div'>) => (
    <div className={className} style={style}>{children}</div>
  ),
}));

vi.mock('../../lib/utils', () => ({
  stripCitationRefs: (s: string) => s,
  cn: (...args: string[]) => args.filter(Boolean).join(' '),
}));

import { useApi } from '../../hooks/useApi';
import { useSurveys } from '../../hooks/useSurveys';
import { SurveyReportPage } from '../../pages/experience/SurveyReportPage';

const mockSurvey = {
  id: 'survey1',
  title: 'Customer NPS Survey',
  status: 'active',
  response_count: 120,
  nps_score: 42,
  deleted_at: null,
};

const execSummaryInsight = {
  id: 'ins-exec',
  headline: 'Executive Summary',
  layer: 'descriptive' as const,
  category: 'report.executive_summary',
  priority: 100,
  trust_score: 88,
  narrative: 'Overall satisfaction has improved significantly this quarter with NPS reaching 42.',
  citations_json: [],
  recommended_action: null,
  user_state_json: {},
  generated_at: '2026-06-21T10:00:00Z',
  metric_json: {
    response_count: 120,
    prior_insights_used: 3,
    cross_theme_patterns: 'Checkout and onboarding share common friction patterns.',
  },
  audit_json: null,
  trust_json: null,
};

const priorityActionInsight = {
  id: 'ins-pa1',
  headline: 'Improve checkout flow to reduce abandonment',
  layer: 'prescriptive' as const,
  category: 'report.priority_action',
  priority: 90,
  trust_score: 82,
  narrative: 'The checkout flow has 3 unnecessary steps that cause drop-off.',
  citations_json: [],
  recommended_action: {
    label: 'Simplify checkout',
    priority: 'critical',
    time_horizon: 'immediate',
    target: 'Engineering',
    estimated_impact: '+8 NPS',
  },
  user_state_json: {},
  generated_at: '2026-06-21T10:00:00Z',
  metric_json: null,
  audit_json: null,
  trust_json: null,
};

const themeInsight = {
  id: 'ins-theme1',
  headline: 'Wait time frustration is a recurring theme',
  layer: 'diagnostic' as const,
  category: 'report.full_theme',
  priority: 80,
  trust_score: 75,
  narrative: 'Customers consistently mention wait times as a pain point.',
  citations_json: [
    { response_id: 'r1', quote: 'I waited 10 minutes to get help', sentiment: 'negative' },
    { response_id: 'r2', quote: 'The wait was too long', sentiment: 'negative' },
    { response_id: 'r3', quote: 'Support took forever', sentiment: 'negative' },
  ],
  recommended_action: {
    label: 'Hire additional support staff',
    time_horizon: 'short_term',
    priority: 'high',
    estimated_impact: '+5 NPS',
  },
  user_state_json: {},
  generated_at: '2026-06-21T10:00:00Z',
  metric_json: {
    sentiment: 'negative',
    frequency_estimate: 32,
    trend_direction: 'declining',
    topic_name: 'Wait Time',
    business_impact: 'High churn risk from unresolved wait time issues.',
    root_cause_hypothesis: 'Understaffed support team during peak hours.',
    is_new_theme: false,
    confirms_prior: true,
  },
  audit_json: null,
  trust_json: null,
};

function buildApiMock(overrides: Record<string, unknown> = {}) {
  return {
    listInsights: vi.fn().mockResolvedValue({
      insights: [execSummaryInsight, priorityActionInsight, themeInsight],
    }),
    ...overrides,
  } as unknown as ReturnType<typeof useApi>;
}

function buildSurveysMock(surveys = [mockSurvey]) {
  return {
    surveys,
    loading: false,
    error: null,
    createSurvey: vi.fn(),
    updateSurvey: vi.fn(),
    deleteSurvey: vi.fn(),
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useSurveys>;
}

beforeEach(() => {
  mockOpenCrystal.mockClear();
  mockSetScope.mockClear();
  vi.mocked(useApi).mockReturnValue(buildApiMock());
  vi.mocked(useSurveys).mockReturnValue(buildSurveysMock());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderPage() {
  return render(<MemoryRouter><SurveyReportPage /></MemoryRouter>);
}

describe('SurveyReportPage', () => {
  it('renders without crash', async () => {
    expect(() => renderPage()).not.toThrow();
    await waitFor(() =>
      expect(screen.getByText('Executive Summary')).toBeInTheDocument(),
    );
  });

  it('empty state: when no report insights, empty state message shown', async () => {
    vi.mocked(useApi).mockReturnValue(
      buildApiMock({ listInsights: vi.fn().mockResolvedValue({ insights: [] }) }),
    );
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('experience.report.noReport')).toBeInTheDocument(),
    );
    expect(screen.getByText('experience.report.generateHint')).toBeInTheDocument();
  });

  it('executive summary card renders when execSummary insight is present', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Executive Summary')).toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Overall satisfaction has improved significantly/),
    ).toBeInTheDocument();
  });

  it('executive summary shows cross-theme patterns when present', async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText('Checkout and onboarding share common friction patterns.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('Cross-theme patterns')).toBeInTheDocument();
  });

  it('priority actions section renders action card with priority badge', async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText('Improve checkout flow to reduce abandonment'),
      ).toBeInTheDocument(),
    );
    // Priority badge text
    expect(screen.getByText('critical')).toBeInTheDocument();
  });

  it('priority action shows time horizon label', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Immediate')).toBeInTheDocument(),
    );
  });

  it('theme card renders headline, sentiment badge metadata, and verbatim quotes', async () => {
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText('Wait time frustration is a recurring theme'),
      ).toBeInTheDocument(),
    );
    // Verbatim quotes shown (up to 2 by default)
    expect(screen.getByText(/I waited 10 minutes to get help/)).toBeInTheDocument();
    expect(screen.getByText(/The wait was too long/)).toBeInTheDocument();
  });

  it('theme card shows reliability badge', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Indicative')).toBeInTheDocument(),
    );
  });

  it('expand theme: clicking card expand button shows business impact + root cause', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText('Wait time frustration is a recurring theme'),
      ).toBeInTheDocument(),
    );
    // The expand button is a small flex-centered button containing only a Material icon span.
    // Its textContent is the icon name text from Material Symbols.
    const allBtns = screen.getAllByRole('button');
    // Find the expand_more button — it's the only non-text button in the theme card
    // not containing "Ask Crystal" or "+N more". It's a w-7 h-7 rounded-full button.
    const expandBtn = allBtns.find(btn => {
      const cls = btn.className ?? '';
      return cls.includes('rounded-full') && cls.includes('w-7') && cls.includes('h-7');
    });
    expect(expandBtn).toBeTruthy();
    await user.click(expandBtn!);
    await waitFor(() =>
      expect(screen.getByText('Business impact')).toBeInTheDocument(),
    );
    expect(screen.getByText('Root cause')).toBeInTheDocument();
    expect(screen.getByText('High churn risk from unresolved wait time issues.')).toBeInTheDocument();
    expect(screen.getByText('Understaffed support team during peak hours.')).toBeInTheDocument();
  });

  it('"Ask Crystal" on executive summary calls openCrystal', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Executive Summary')).toBeInTheDocument(),
    );
    const askBtn = screen.getByRole('button', { name: /Ask Crystal about this report/i });
    await user.click(askBtn);
    expect(mockOpenCrystal).toHaveBeenCalled();
    expect(mockOpenCrystal.mock.calls[0][0]).toBe(
      'Walk me through the key findings in this report and what I should act on first',
    );
  });

  it('"Ask Crystal" on theme card calls openCrystal with focused_topic', async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() =>
      expect(
        screen.getByText('Wait time frustration is a recurring theme'),
      ).toBeInTheDocument(),
    );
    const askBtns = screen.getAllByRole('button', { name: /Ask Crystal/i });
    // The theme's "Ask Crystal" button is the one that says just "Ask Crystal" (not "about this report")
    const themeAskBtn = askBtns.find(btn => !btn.textContent?.includes('about this report'));
    expect(themeAskBtn).toBeTruthy();
    await user.click(themeAskBtn!);
    expect(mockOpenCrystal).toHaveBeenCalled();
    const callArgs = mockOpenCrystal.mock.calls[0];
    expect(callArgs[0]).toContain('Wait time frustration is a recurring theme');
    expect(callArgs[1]).toMatchObject({ focused_topic: 'Wait Time' });
  });

  it('scopes Crystal panel to surveyId on mount', async () => {
    renderPage();
    await waitFor(() => expect(mockSetScope).toHaveBeenCalledWith('survey1'));
  });

  it('shows "Confirmed ↑" badge for confirmed prior findings', async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByText('Confirmed ↑')).toBeInTheDocument(),
    );
  });
});
