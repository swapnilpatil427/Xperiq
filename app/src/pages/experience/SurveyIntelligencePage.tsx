import { useParams } from 'react-router-dom';
import { useTranslation } from '../../lib/i18n';
import { useSurveyIntelligence } from '../../hooks/useExperience';
import { ProgressArc } from '../../components/insights/ProgressArc';
import { InsightStateBanner } from '../../components/insights/InsightStateBanner';
import { SurveyStatusBanner } from '../../components/insights/SurveyStatusBanner';
import type { AgenticInsight } from '../../types';

function computeDataTier(responseCount: number): string {
  if (responseCount < 10)  return 'collecting';
  if (responseCount < 40)  return 'first_voices';
  if (responseCount < 70)  return 'early_signals';
  if (responseCount < 100) return 'growing_picture';
  return 'full_report';
}

export function SurveyIntelligencePage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const { t } = useTranslation();
  const { data, loading } = useSurveyIntelligence(surveyId!);

  const insights: AgenticInsight[] = (data as any)?.insights || [];
  const responseCount: number = (data as any)?.survey?.response_count ?? 0;
  const tier = computeDataTier(responseCount);
  const surveyStatus: 'active' | 'paused' | 'closed' | 'draft' = (data as any)?.survey_status || 'active';
  const pipelineActive: boolean = (data as any)?.pipeline_active === true;
  const crystalOpening: string | null = (data as any)?.crystal_opening ?? null;

  if (loading) return <div className="p-6 animate-pulse">{t('common.loading')}</div>;

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      {/* Survey suspended banner */}
      {surveyStatus === 'paused' && (
        <SurveyStatusBanner status="paused" responseCount={responseCount} />
      )}
      {surveyStatus === 'closed' && (
        <SurveyStatusBanner status="closed" responseCount={responseCount} />
      )}

      {/* Progress arc (only for < full_report) */}
      {tier !== 'full_report' && (
        <div className="flex items-center gap-4">
          <ProgressArc tier={tier as any} />
          <div>
            <div className="font-medium">{t(`insights.tier.${tier}.label`)}</div>
            <div className="text-sm opacity-60">{responseCount} {t('common.responses')}</div>
          </div>
        </div>
      )}

      {/* Insight state banner */}
      <InsightStateBanner
        pageState={tier === 'collecting' ? 'collecting' : pipelineActive ? 'generating' : 'ready'}
        surveyStatus={surveyStatus as any}
        canManualRefresh={surveyStatus === 'active' && !pipelineActive}
        manualRefreshLimitReached={false}
        onGenerateInsight={() => {}}
      />

      {/* Crystal opening */}
      {crystalOpening && tier !== 'collecting' && (
        <div className="glass-card rounded-xl p-4 border-l-4" style={{ borderColor: 'var(--color-primary)' }}>
          <div className="text-sm opacity-60 mb-1">{t('insights.crystal.opening.label')}</div>
          <p className="text-sm">{crystalOpening}</p>
        </div>
      )}

      {/* Insight cards */}
      {tier === 'collecting' ? (
        <div className="text-center py-16 opacity-50">{t('insights.tier.collecting.label')}</div>
      ) : (
        <div className="space-y-3">
          {insights.slice(0, tier === 'first_voices' ? 3 : undefined).map((ins: AgenticInsight) => (
            <div key={ins.id} className="glass-card rounded-xl p-4">
              <div className="font-medium">{ins.headline}</div>
              {ins.narrative && <p className="text-sm opacity-70 mt-1">{ins.narrative}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
