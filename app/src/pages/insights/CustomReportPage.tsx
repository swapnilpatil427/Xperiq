// CustomReportPage — Insight Pipeline v2, Phase 6
//
// /app/surveys/:surveyId/intelligence/custom/:reportId
//
// Result view for a completed custom analysis. Lists custom_report_insights with
// the filter_label and an n<30 trust caveat. These never supersede the active
// automated projection — they are read from custom_report_insights only.

import { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useApi } from '../../hooks/useApi';
import { useTranslation } from '../../lib/i18n';
import { ROUTES, toPath } from '../../constants/routes';
import { getFeatureFlags } from '../../lib/features';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { LAYER_CONFIG, type InsightLayer } from './shared';
import type { CustomReportDetail } from '../../types';

const MIN_N = 30;

export function CustomReportPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { surveyId, reportId } = useParams<{ surveyId: string; reportId: string }>();
  useSetPageTitle(t('surveyInsights.customAnalysis.title'));

  const [detail, setDetail] = useState<CustomReportDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = () => {
    if (!reportId) return;
    setLoading(true);
    setError(false);
    api.getCustomReport(reportId)
      .then(setDetail)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, [api, reportId]);

  // Feature flag guard — placed after all hook calls to satisfy React's Rules of Hooks
  const { insightsTrajectoryV1 } = getFeatureFlags();
  if (!insightsTrajectoryV1) return <Navigate to={ROUTES.INSIGHTS} replace />;

  const report = detail?.report;
  const insights = detail?.insights ?? [];
  const sample = report?.sample_size ?? null;
  const lowConfidence = report?.low_confidence || (sample != null && sample < MIN_N);

  return (
    <div className="max-w-3xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('surveyInsights.customAnalysis.resultBack'), path: toPath(ROUTES.CUSTOM_ANALYSIS, { surveyId: surveyId ?? '' }) },
          { label: report?.name ?? t('surveyInsights.customAnalysis.title') },
        ]}
        title={report?.name ?? t('surveyInsights.customAnalysis.title')}
        subtitle={report?.filter_label ?? undefined}
      />

      {loading ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="animate-pulse rounded-xl bg-muted h-24" />)}</div>
      ) : error || !report ? (
        <div className="text-center py-16">
          <Icon name="error" size={32} className="text-muted-foreground mx-auto" />
          <div className="font-semibold mt-3">{t('surveyInsights.customAnalysis.resultErrorTitle')}</div>
          <p className="text-sm text-muted-foreground mt-1">{t('surveyInsights.customAnalysis.resultErrorBody')}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={load}>{t('surveyInsights.settings.retry')}</Button>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Trust caveat */}
          {lowConfidence && (
            <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <Icon name="warning" size={16} className="mt-0.5 flex-shrink-0" />
              <span>{t('surveyInsights.customAnalysis.resultCaveat', { count: sample ?? 0 })}</span>
            </div>
          )}

          {sample != null && (
            <div className="text-xs text-muted-foreground font-mono">
              {t('surveyInsights.customAnalysis.resultSampleNote', { count: sample })}
            </div>
          )}

          {(report.status === 'pending' || report.status === 'running') && (
            <div className="rounded-xl border border-border bg-card px-5 py-6 text-center space-y-2">
              <div className="animate-pulse text-sm text-muted-foreground">{t('surveyInsights.customAnalysis.reportRunning')}</div>
            </div>
          )}

          {insights.length === 0 && report.status !== 'pending' && report.status !== 'running' && (
            <div className="text-sm text-muted-foreground py-8 text-center">{t('surveyInsights.customAnalysis.resultEmpty')}</div>
          )}

          {insights.length > 0 && (
            <div className="space-y-3">
              {insights.map((ins) => {
                const cfg = LAYER_CONFIG[(ins.layer as InsightLayer)] ?? LAYER_CONFIG.descriptive;
                return (
                  <div key={ins.id} className="rounded-2xl border border-border bg-card p-5">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                        style={{ background: cfg.bg, color: cfg.color }}>
                        {t(`surveyInsights.layers.${ins.layer}.label`, { defaultValue: ins.layer })}
                      </span>
                      {ins.filter_label && (
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {t('surveyInsights.customAnalysis.filterLabel')}: {ins.filter_label}
                        </span>
                      )}
                      {ins.trust_score != null && (
                        <span className="ml-auto text-[10px] font-bold text-muted-foreground">{Math.round(ins.trust_score)}</span>
                      )}
                    </div>
                    <div className="font-semibold text-on-surface">{ins.headline}</div>
                    {ins.narrative && <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{ins.narrative}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
