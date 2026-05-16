// Insights Dashboard — Crystal Command.
// Crystal (Experient Copilot) is the AI thread throughout: dark cinematic hero →
// portfolio brief → live metrics → deeper findings bento → Crystal Q&A →
// auto-surfaced findings.
// See docs/insights/SURVEY_SCOPE_UX.md and docs/insights/ARCHITECTURE.md.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useInsights } from '../hooks/useInsights';
import { useApi } from '../hooks/useApi';
import { useSurveys } from '../hooks/useSurveys';
import { ROUTES } from '../constants/routes';
import { useTranslation } from '../lib/i18n';
import { PageHeader } from '../components/PageHeader';
import { Icon } from '../components/Icon';
import { Button } from '@/components/ui/button';
import { SurveyScopePicker, type SurveyScope } from '../components/SurveyScopePicker';
import { UnifiedInsightsView } from './insights/UnifiedInsightsView';
import { CrystalPanel } from '../components/CrystalPanel';
import { useCrystalPanel } from '../contexts/crystalPanel';
import type { AgenticInsight, SurveyTopic } from '../types';

const SCOPE_STORAGE_KEY = 'insights_scope';

// Pipeline nodes for the generating overlay
const INSIGHT_NODES = [
  { id: 'ingest',   label: 'Loading Responses',  icon: 'download'             },
  { id: 'embed',    label: 'Building Embeddings', icon: 'memory'               },
  { id: 'metrics',  label: 'Computing Metrics',   icon: 'analytics'            },
  { id: 'absa',     label: 'Sentiment Analysis',  icon: 'sentiment_satisfied'  },
  { id: 'cluster',  label: 'Clustering Topics',   icon: 'hub'                  },
  { id: 'topics',   label: 'Discovering Topics',  icon: 'topic'                },
  { id: 'narrate',  label: 'Narrating Insights',  icon: 'edit_note'            },
  { id: 'verify',   label: 'Verifying Claims',    icon: 'fact_check'           },
  { id: 'evaluate', label: 'Evaluating Quality',  icon: 'verified'             },
  { id: 'publish',  label: 'Publishing Results',  icon: 'publish'              },
] as const;

export function InsightsDashboardPage() {
  const { t } = useTranslation();
  const api = useApi();
  const [searchParams, setSearchParams] = useSearchParams();
  useSetPageTitle(t('insights.pageTitle'), t('insights.dateFilter'));

  const { surveys } = useSurveys();
  const { setScope: setCrystalScope } = useCrystalPanel();

  // ── Scope: URL is the source of truth. ?survey=ID for single survey, nothing for 'all'. ──
  const scope = useMemo<SurveyScope>(
    () => searchParams.get('survey') ?? 'all',
    [searchParams],
  );

  // On first mount with no URL param: restore last-used scope from localStorage.
  useEffect(() => {
    if (!searchParams.get('survey')) {
      const saved = localStorage.getItem(SCOPE_STORAGE_KEY);
      if (saved && saved !== 'all') {
        setSearchParams({ survey: saved }, { replace: true });
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // If URL scope references a survey that no longer exists, fall back to 'all'.
  useEffect(() => {
    if (scope !== 'all' && surveys.length > 0 && !surveys.some((s) => s.id === scope)) {
      setSearchParams({}, { replace: true });
    }
  }, [scope, surveys, setSearchParams]);

  const handleScopeChange = (next: SurveyScope) => {
    setCrystalScope(next);
    if (next === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ survey: next });
    }
    try {
      window.localStorage.setItem(SCOPE_STORAGE_KEY, next);
    } catch {
      // Safari private mode — ignore
    }
  };

  // ── Legacy insights (for the demo hero/brief sections) ───────────────────
  const focusSurveyId =
    scope === 'all' ? surveys.find((s) => s.status === 'active')?.id : scope;
  const focusSurvey = surveys.find((s) => s.id === focusSurveyId);
  const { insights, generating: legacyGenerating, regenerate } = useInsights(focusSurveyId);

  // ── Topics (from survey_topics table) ────────────────────────────────────
  const [topics, setTopics] = useState<SurveyTopic[]>([]);

  useEffect(() => {
    if (!focusSurveyId) { setTopics([]); return; }
    api.listTopics(focusSurveyId)
      .then(({ topics: t }) => setTopics(t ?? []))
      .catch(() => setTopics([]));
  }, [api, focusSurveyId]);

  // ── Agentic insights (real pipeline data) ────────────────────────────────
  const [agenticInsights, setAgenticInsights] = useState<AgenticInsight[]>([]);
  const [agenticLoading,  setAgenticLoading]  = useState(false);
  const [generating,      setGenerating]      = useState(false);
  const [nodesDone,       setNodesDone]       = useState<string[]>([]);
  const [genError,        setGenError]        = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadAgentic = useCallback(async () => {
    if (!focusSurveyId) { setAgenticInsights([]); return; }
    setAgenticLoading(true);
    try {
      const { insights: list } = await api.listInsights(focusSurveyId);
      setAgenticInsights(list ?? []);
    } catch {
      setAgenticInsights([]);
    } finally {
      setAgenticLoading(false);
    }
  }, [api, focusSurveyId]);

  useEffect(() => {
    loadAgentic();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAgentic]);

  const handleGenerate = useCallback(async () => {
    if (!focusSurveyId || generating) return;
    setGenerating(true);
    setNodesDone([]);
    setGenError(null);
    try {
      await api.triggerInsightGeneration(focusSurveyId);
    } catch {
      setGenError('Failed to start insight generation. Is the agents service running?');
      setGenerating(false);
      return;
    }
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 3;
      try {
        const { status, stream_events } = await api.getInsightRunStatus(focusSurveyId);
        const completed = (stream_events as Array<{ event: string; agent: string }>)
          .filter(e => e.event === 'node_complete')
          .map(e => e.agent);
        setNodesDone(completed);
        if (status === 'failed') {
          clearInterval(pollRef.current!);
          setGenError('Insight generation failed. Check the agents service logs.');
          setGenerating(false);
          return;
        }
        if (status === 'completed') {
          clearInterval(pollRef.current!);
          setNodesDone(INSIGHT_NODES.map(n => n.id));
          await new Promise(r => setTimeout(r, 700));
          await loadAgentic();
          setGenerating(false);
          setNodesDone([]);
          return;
        }
      } catch { /* keep polling */ }
      if (elapsed >= 120) {
        clearInterval(pollRef.current!);
        setGenError('Generation timed out.');
        setGenerating(false);
      }
    }, 3000);
  }, [api, focusSurveyId, generating, loadAgentic]);

  const subtitle =
    scope === 'all'
      ? `Cross-survey portfolio · ${surveys.filter((s) => s.status === 'active').length} active surveys`
      : focusSurvey
        ? `${focusSurvey.title} · ${(focusSurvey.response_count ?? 0).toLocaleString()} responses`
        : t('insights.topicDescription', { count: insights?.topics?.length ?? 4 });

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('nav.insights'), icon: 'psychology', path: ROUTES.INSIGHTS }]}
        title={t('insights.pageTitle')}
        subtitle={subtitle}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <SurveyScopePicker surveys={surveys} scope={scope} onChange={handleScopeChange} />
            <Button
              variant="outline"
              size="sm"
              onClick={regenerate}
              disabled={legacyGenerating || scope === 'all'}
              className="text-xs h-auto py-2 px-3"
              title={scope === 'all' ? 'Pick a single survey to regenerate' : undefined}
            >
              <Icon
                name={legacyGenerating ? 'hourglass_top' : 'refresh'}
                size={16}
                style={{ animation: legacyGenerating ? 'spin 1s linear infinite' : undefined }}
              />
              {legacyGenerating ? t('common.regenerating') : t('insights.refreshButton')}
            </Button>
          </div>
        }
      />

      <UnifiedInsightsView
        insights={insights}
        scope={scope}
        surveys={surveys}
        agenticInsights={agenticInsights}
        agenticLoading={agenticLoading}
        generating={generating}
        nodesDone={nodesDone}
        genError={genError}
        onGenerate={handleGenerate}
        focusSurvey={focusSurvey}
      />

      {/* Crystal Panel — fixed overlay on the right, wired to useCrystalPanel context */}
      <CrystalPanel scope={scope} surveys={surveys} insights={insights} agenticInsights={agenticInsights} topics={topics} />
    </div>
  );
}
