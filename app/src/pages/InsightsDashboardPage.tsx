// Insights Dashboard — Crystal Command.
// Crystal (Experient Copilot) is the AI thread throughout: dark cinematic hero →
// portfolio brief → live metrics → deeper findings bento → Crystal Q&A →
// auto-surfaced findings.
// See docs/insights/SURVEY_SCOPE_UX.md and docs/insights/ARCHITECTURE.md.

import { useState, useEffect } from 'react';
import { useSetPageTitle } from '../contexts/pageTitle';
import { useInsights } from '../hooks/useInsights';
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

const SCOPE_STORAGE_KEY = 'insights_scope';

export function InsightsDashboardPage() {
  const { t } = useTranslation();
  useSetPageTitle(t('insights.pageTitle'), t('insights.dateFilter'));

  const { surveys } = useSurveys();
  const { setScope: setCrystalScope } = useCrystalPanel();

  // ── Scope: "all" or a survey id. Persists in localStorage. ──────────────
  const [scope, setScope] = useState<SurveyScope>(() => {
    if (typeof window === 'undefined') return 'all';
    return (window.localStorage.getItem(SCOPE_STORAGE_KEY) as SurveyScope) ?? 'all';
  });

  // If saved scope references a survey that no longer exists, fall back to 'all'.
  useEffect(() => {
    if (scope !== 'all' && surveys.length > 0 && !surveys.some((s) => s.id === scope)) {
      setScope('all');
    }
  }, [scope, surveys]);

  const handleScopeChange = (next: SurveyScope) => {
    setScope(next);
    setCrystalScope(next);
    try {
      window.localStorage.setItem(SCOPE_STORAGE_KEY, next);
    } catch {
      // Safari private mode — ignore
    }
  };

  // ── Insights: loaded for a specific survey or representative active survey.
  //   Cross-survey aggregation (/api/insights/aggregate) ships in v1.1.
  const focusSurveyId =
    scope === 'all' ? surveys.find((s) => s.status === 'active')?.id : scope;
  const focusSurvey = surveys.find((s) => s.id === focusSurveyId);
  const { insights, generating, regenerate } = useInsights(focusSurveyId);

  const subtitle =
    scope === 'all'
      ? `Cross-survey portfolio · ${surveys.filter((s) => s.status === 'active').length} active surveys`
      : focusSurvey
        ? `${focusSurvey.title} · ${(focusSurvey.response_count ?? insights?.response_count ?? 0).toLocaleString()} responses`
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
              disabled={generating || scope === 'all'}
              className="text-xs h-auto py-2 px-3"
              title={scope === 'all' ? 'Pick a single survey to regenerate' : undefined}
            >
              <Icon
                name={generating ? 'hourglass_top' : 'refresh'}
                size={16}
                style={{ animation: generating ? 'spin 1s linear infinite' : undefined }}
              />
              {generating ? t('common.regenerating') : t('insights.refreshButton')}
            </Button>
          </div>
        }
      />

      <UnifiedInsightsView insights={insights} scope={scope} surveys={surveys} />

      {/* Crystal Panel — fixed overlay on the right, wired to useCrystalPanel context */}
      <CrystalPanel scope={scope} surveys={surveys} insights={insights} />
    </div>
  );
}
