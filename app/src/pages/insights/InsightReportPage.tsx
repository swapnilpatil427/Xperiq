// InsightReportPage — Insight Pipeline v2, Phase 4
//
// /app/surveys/:surveyId/intelligence/reports/:reportId
//
// Minimal viewer for a persisted manual insight report. Renders the report's
// summary/findings document when present, with a back link to the Trail. The
// document shape is intentionally loose (Record<string, unknown>) — the backend
// owns the schema; we render the common fields defensively.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useApi } from '../../hooks/useApi';
import { useTranslation } from '../../lib/i18n';
import { ROUTES, toPath } from '../../constants/routes';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import type { InsightReport } from '../../types';

function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

export function InsightReportPage() {
  const { t } = useTranslation();
  const api = useApi();
  const { surveyId, reportId } = useParams<{ surveyId: string; reportId: string }>();
  useSetPageTitle(t('surveyInsights.trail.title'));

  const [report, setReport] = useState<InsightReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!surveyId || !reportId) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    api.getInsightReport(surveyId, reportId)
      .then((r) => { if (!cancelled) setReport(r); })
      .catch(() => { if (!cancelled) setError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, surveyId, reportId]);

  const doc = (report?.document ?? report?.report ?? {}) as Record<string, unknown>;
  const title = asString(doc.title) ?? asString(doc.label) ?? t('surveyInsights.trail.title');
  const summary = asString(doc.summary) ?? asString(doc.narrative);
  const findings = Array.isArray(doc.findings) ? (doc.findings as unknown[]) : [];

  return (
    <div className="max-w-3xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('surveyInsights.trail.title'), path: toPath(ROUTES.INSIGHT_TRAIL, { surveyId: surveyId ?? '' }) },
          { label: title },
        ]}
        title={title}
      />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => <div key={i} className="animate-pulse rounded-xl bg-zinc-900 h-24" />)}
        </div>
      ) : error || !report ? (
        <div className="text-center py-16">
          <Icon name="error" size={32} className="text-zinc-600 mx-auto" />
          <div className="font-semibold text-zinc-200 mt-3">{t('surveyInsights.trail.errorTitle')}</div>
          <p className="text-sm text-zinc-500 mt-1">{t('surveyInsights.trail.errorBody')}</p>
          <Button
            size="sm"
            variant="outline"
            className="mt-4"
            onClick={() => { setLoading(true); setError(false); }}
          >
            {t('surveyInsights.trail.retry')}
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {summary && (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-5 text-sm text-zinc-200 leading-relaxed">
              {summary}
            </div>
          )}
          {findings.length > 0 && (
            <div className="space-y-3">
              {findings.map((f, i) => {
                const fo = (f ?? {}) as Record<string, unknown>;
                const h = asString(fo.headline) ?? asString(fo.title) ?? `Finding ${i + 1}`;
                const body = asString(fo.narrative) ?? asString(fo.body);
                return (
                  <div key={i} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                    <div className="font-semibold text-zinc-100">{h}</div>
                    {body && <p className="text-sm text-zinc-400 mt-1.5 leading-relaxed">{body}</p>}
                  </div>
                );
              })}
            </div>
          )}
          {!summary && findings.length === 0 && (
            <div className="text-sm text-zinc-500">{t('surveyInsights.trail.emptyManual')}</div>
          )}
        </div>
      )}
    </div>
  );
}
