// CustomAnalysisPage — Insight Pipeline v2, Phase 6 (05_CONFIGURATION §D, 06_UX_DESIGN)
//
// /app/surveys/:surveyId/intelligence/custom
//
// Full-width (NOT a modal) 3-step wizard:
//   1. Date range + segment filter
//   2. Topic selection + metric depth (metric_types, narrative_depth)
//   3. Preview (corpus size, est cost, sample size, low-confidence warning if
//      n<30) + name field + confirm
//
// On confirm → createCustomReport → poll run-status → navigate to the result
// view. Below the wizard: a list of past custom reports. Custom results are
// written to custom_report_insights, never the active projection.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useApi } from '../../hooks/useApi';
import { useTranslation } from '../../lib/i18n';
import { ROUTES, toPath } from '../../constants/routes';
import { getFeatureFlags } from '../../lib/features';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { ManualRunError } from '../../lib/api';
import type {
  CustomReport,
  CustomReportFilterSpec,
  CustomReportPreview,
} from '../../types';

const POLL_MS = 3_000;
const POLL_TIMEOUT_S = 600;

const METRIC_TYPES = ['nps', 'csat', 'ces', 'sentiment'] as const;
const DEPTHS = ['brief', 'standard', 'deep'] as const;
type Depth = (typeof DEPTHS)[number];
type Step = 1 | 2 | 3;
type Phase = 'config' | 'running' | 'error';

// ── Tag input (segments / topics) ──────────────────────────────────────────────
function TagInput({
  values,
  onChange,
  placeholder,
  ariaLabel,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setText('');
  };
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {values.map((v) => (
          <span key={v} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary text-xs font-semibold px-2.5 py-1">
            {v}
            <button type="button" aria-label={t('surveyInsights.customAnalysis.tagRemoveAriaLabel', { tag: v })} onClick={() => onChange(values.filter((x) => x !== v))}>
              <Icon name="close" size={12} />
            </button>
          </span>
        ))}
      </div>
      <Input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
        onBlur={add}
        placeholder={placeholder}
        aria-label={ariaLabel}
      />
    </div>
  );
}

// ── Past reports list ───────────────────────────────────────────────────────────
function PastReports({ surveyId }: { surveyId: string }) {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const [reports, setReports] = useState<CustomReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError(false);
    api.listCustomReports(surveyId)
      .then((r) => setReports(r.reports))
      .catch(() => { setReports([]); setError(true); })
      .finally(() => setLoading(false));
  }, [api, surveyId]);
  useEffect(() => { load(); }, [load]);

  const statusKey = (s: string) =>
    s === 'completed' ? 'statusCompleted' : s === 'running' ? 'statusRunning' : s === 'failed' ? 'statusFailed' : 'statusPending';

  return (
    <section className="mt-10">
      <h2 className="text-base font-bold text-on-surface mb-3">{t('surveyInsights.customAnalysis.pastTitle')}</h2>
      {loading ? (
        <div className="space-y-2">{[0, 1].map((i) => <div key={i} className="animate-pulse rounded-xl bg-muted h-16" />)}</div>
      ) : error && reports.length === 0 ? (
        <div className="text-sm text-destructive py-4">{t('surveyInsights.customAnalysis.pastReportsError')}</div>
      ) : reports.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4">{t('surveyInsights.customAnalysis.pastEmpty')}</div>
      ) : (
        <div className="space-y-2">
          {reports.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => navigate(toPath(ROUTES.CUSTOM_REPORT, { surveyId, reportId: r.id }))}
              className="w-full text-left rounded-xl border border-border bg-card px-4 py-3 hover:border-primary/40 transition-colors flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="font-semibold text-sm text-on-surface truncate">{r.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {r.filter_label ?? ''}
                  {r.created_by ? ` · ${t('surveyInsights.customAnalysis.createdBy', { name: r.created_by })}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {r.low_confidence && <Icon name="warning" size={14} className="text-amber-500" />}
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full',
                  r.status === 'completed' ? 'bg-emerald-100 text-emerald-700'
                  : r.status === 'failed' ? 'bg-rose-100 text-rose-700'
                  : 'bg-muted text-muted-foreground')}>
                  {t(`surveyInsights.customAnalysis.${statusKey(r.status)}`)}
                </span>
                <Icon name="chevron_right" size={16} className="text-muted-foreground" />
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export function CustomAnalysisPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { surveyId } = useParams<{ surveyId: string }>();
  useSetPageTitle(t('surveyInsights.customAnalysis.title'), t('surveyInsights.customAnalysis.subtitle'));

  const [step, setStep] = useState<Step>(1);
  const [phase, setPhase] = useState<Phase>('config');

  // Step 1
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [segments, setSegments] = useState<string[]>([]);
  // Step 2
  const [topics, setTopics] = useState<string[]>([]);
  const [metricTypes, setMetricTypes] = useState<string[]>(['nps', 'sentiment']);
  const [depth, setDepth] = useState<Depth>('standard');
  // Step 3
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState(false);

  const [preview, setPreview] = useState<CustomReportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const [errorCode, setErrorCode] = useState<ManualRunError['code'] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const filterSpec = useCallback((): CustomReportFilterSpec => ({
    date_from: dateFrom ? new Date(dateFrom).toISOString() : null,
    date_to: dateTo ? new Date(dateTo).toISOString() : null,
    segments: segments.length ? segments : undefined,
    topics: topics.length ? topics : undefined,
    metric_types: metricTypes.length ? metricTypes : undefined,
    narrative_depth: depth,
  }), [dateFrom, dateTo, segments, topics, metricTypes, depth]);

  // Recompute the preview when we reach step 3 or the spec changes there.
  useEffect(() => {
    if (step !== 3 || !surveyId) return;
    let cancelled = false;
    setPreviewLoading(true);
    setPreviewFailed(false);
    api.previewCustomReport({ survey_id: surveyId, filter_spec: filterSpec() })
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) { setPreview(null); setPreviewFailed(true); } })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [step, surveyId, api, filterSpec]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const startPolling = useCallback((reportId: string) => {
    let elapsed = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      elapsed += POLL_MS / 1000;
      try {
        const detail = await api.getCustomReport(reportId);
        const st = detail.report.status;
        if (st === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          navigate(toPath(ROUTES.CUSTOM_REPORT, { surveyId: surveyId!, reportId }));
          return;
        }
        if (st === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMessage(t('surveyInsights.customAnalysis.errorFailed'));
          setPhase('error');
          return;
        }
      } catch { /* transient — keep polling */ }
      if (elapsed >= POLL_TIMEOUT_S) {
        if (pollRef.current) clearInterval(pollRef.current);
        navigate(toPath(ROUTES.CUSTOM_REPORT, { surveyId: surveyId!, reportId }));
      }
    }, POLL_MS);
  }, [api, navigate, surveyId, t]);

  const handleConfirm = useCallback(async () => {
    if (!surveyId) return;
    if (!name.trim()) { setNameError(true); return; }
    setNameError(false);
    setPhase('running');
    setErrorCode(null);
    setErrorMessage(null);
    try {
      const res = await api.createCustomReport({ survey_id: surveyId, name: name.trim(), filter_spec: filterSpec() });
      startPolling(res.report_id);
    } catch (err) {
      if (err instanceof ManualRunError) {
        setErrorCode(err.code);
        setErrorMessage(
          err.code === 'INSUFFICIENT_CREDITS' ? t('surveyInsights.customAnalysis.errorCredits')
          : err.code === 'RATE_LIMITED' ? t('surveyInsights.customAnalysis.errorRateLimited')
          : err.code === 'INSUFFICIENT_DATA' ? t('surveyInsights.customAnalysis.errorInsufficientData')
          : t('surveyInsights.customAnalysis.errorGeneric'),
        );
      } else {
        setErrorMessage(t('surveyInsights.customAnalysis.errorGeneric'));
      }
      setPhase('error');
    }
  }, [api, surveyId, name, filterSpec, startPolling, t]);

  // Feature flag guard — placed after all hook calls to satisfy React's Rules of Hooks
  const { insightsTrajectoryV1 } = getFeatureFlags();
  if (!insightsTrajectoryV1) return <Navigate to={ROUTES.INSIGHTS} replace />;

  const toggleMetric = (m: string) =>
    setMetricTypes((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]);

  const lowConfidence = preview?.low_confidence ?? (preview?.sample_size != null && preview.sample_size < 30);

  const stepPill = (n: Step, labelKey: string) => (
    <div className="flex items-center gap-2">
      <span className={cn('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold',
        step === n ? 'bg-primary text-white' : step > n ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>
        {step > n ? <Icon name="check" size={14} /> : n}
      </span>
      <span className={cn('text-sm font-semibold', step === n ? 'text-on-surface' : 'text-muted-foreground')}>
        {t(`surveyInsights.customAnalysis.${labelKey}`)}
      </span>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('surveyInsights.customAnalysis.back'), path: toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: surveyId ?? '' }) },
          { label: t('surveyInsights.customAnalysis.title') },
        ]}
        title={t('surveyInsights.customAnalysis.title')}
        subtitle={t('surveyInsights.customAnalysis.subtitle')}
      />

      {/* Stepper */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        {stepPill(1, 'stepScope')}
        <span className="text-muted-foreground">—</span>
        {stepPill(2, 'stepFocus')}
        <span className="text-muted-foreground">—</span>
        {stepPill(3, 'stepReview')}
        <span className="ml-auto text-xs text-muted-foreground">
          {t('surveyInsights.customAnalysis.stepOf', { current: step, total: 3 })}
        </span>
      </div>

      {(phase === 'running') ? (
        <div className="rounded-2xl border border-border bg-card p-8 flex flex-col items-center text-center gap-3">
          <Icon name="hourglass_top" size={32} className="text-primary" style={{ animation: 'spin 1.4s linear infinite' }} />
          <div className="font-bold">{t('surveyInsights.customAnalysis.progressTitle')}</div>
          <p className="text-sm text-muted-foreground max-w-sm">{t('surveyInsights.customAnalysis.progressBody')}</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-border bg-card p-6">
          {/* Step 1 — scope */}
          {step === 1 && (
            <div className="space-y-5">
              <h2 className="text-base font-bold">{t('surveyInsights.customAnalysis.scopeTitle')}</h2>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ca-from" className="text-xs text-muted-foreground">{t('surveyInsights.customAnalysis.dateFrom')}</Label>
                  <Input id="ca-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="ca-to" className="text-xs text-muted-foreground">{t('surveyInsights.customAnalysis.dateTo')}</Label>
                  <Input id="ca-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="mt-1" />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">{t('surveyInsights.customAnalysis.dateHint')}</p>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('surveyInsights.customAnalysis.segmentsLabel')}
                </Label>
                <div className="mt-2">
                  <TagInput
                    values={segments}
                    onChange={setSegments}
                    placeholder={t('surveyInsights.customAnalysis.segmentsPlaceholder')}
                    ariaLabel={t('surveyInsights.customAnalysis.segmentsLabel')}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('surveyInsights.customAnalysis.segmentsHint')}</p>
              </div>
            </div>
          )}

          {/* Step 2 — focus */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-base font-bold">{t('surveyInsights.customAnalysis.focusTitle')}</h2>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('surveyInsights.customAnalysis.topicsLabel')}
                </Label>
                <div className="mt-2">
                  <TagInput
                    values={topics}
                    onChange={setTopics}
                    placeholder={t('surveyInsights.customAnalysis.topicsPlaceholder')}
                    ariaLabel={t('surveyInsights.customAnalysis.topicsLabel')}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{t('surveyInsights.customAnalysis.topicsHint')}</p>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('surveyInsights.customAnalysis.metricTypesLabel')}
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {METRIC_TYPES.map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => toggleMetric(m)}
                      aria-pressed={metricTypes.includes(m)}
                      className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border uppercase transition-colors',
                        metricTypes.includes(m) ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50')}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('surveyInsights.customAnalysis.narrativeDepthLabel')}
                </Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {DEPTHS.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDepth(d)}
                      aria-pressed={depth === d}
                      className={cn('px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                        depth === d ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:bg-muted/50')}
                    >
                      {t(`surveyInsights.customAnalysis.depth${d.charAt(0).toUpperCase() + d.slice(1)}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3 — review */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-base font-bold">{t('surveyInsights.customAnalysis.reviewTitle')}</h2>

              <div>
                <Label htmlFor="ca-name" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  {t('surveyInsights.customAnalysis.nameLabel')}
                </Label>
                <Input
                  id="ca-name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setNameError(false); }}
                  placeholder={t('surveyInsights.customAnalysis.namePlaceholder')}
                  className={cn('mt-2', nameError && 'border-rose-400 focus-visible:ring-rose-400')}
                  maxLength={140}
                  aria-invalid={nameError}
                />
                {nameError && <p role="alert" className="text-[11px] text-rose-600 mt-1">{t('surveyInsights.customAnalysis.nameRequired')}</p>}
              </div>

              {/* Preview */}
              <div className="rounded-2xl border border-border bg-muted/30 p-4">
                <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                  {t('surveyInsights.customAnalysis.previewLabel')}
                </div>
                {previewLoading ? (
                  <div className="text-sm text-muted-foreground animate-pulse">{t('surveyInsights.customAnalysis.previewLoading')}</div>
                ) : previewFailed || !preview ? (
                  <div className="text-sm text-muted-foreground">{t('surveyInsights.customAnalysis.previewUnavailable')}</div>
                ) : (
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('surveyInsights.customAnalysis.previewCorpus')}</dt>
                      <dd className="font-mono tabular-nums">{(preview.corpus_size ?? 0).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('surveyInsights.customAnalysis.previewSample')}</dt>
                      <dd className="font-mono tabular-nums">{(preview.sample_size ?? 0).toLocaleString()}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">{t('surveyInsights.customAnalysis.previewCost')}</dt>
                      <dd className="font-mono tabular-nums">
                        {t('surveyInsights.customAnalysis.previewCostValue', { cost: preview.estimated_cost ?? 0 })}
                      </dd>
                    </div>
                  </dl>
                )}
                {lowConfidence && preview && (
                  <div role="alert" className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-100 text-amber-800 px-3 py-2 text-xs font-medium">
                    <Icon name="warning" size={14} />
                    {t('surveyInsights.customAnalysis.lowConfidence')}
                  </div>
                )}
              </div>

              {/* Error banner */}
              {phase === 'error' && errorMessage && (
                <div role="alert" className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800">
                  <div className="font-semibold">{errorMessage}</div>
                  {errorCode === 'INSUFFICIENT_CREDITS' && (
                    <div className="text-xs mt-1 text-rose-700">{t('surveyInsights.customAnalysis.errorCreditsCta')}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Wizard nav */}
          <div className="flex items-center justify-between mt-6 pt-4 border-t border-border">
            <Button
              variant="outline"
              onClick={() => (step === 1 ? navigate(toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: surveyId ?? '' })) : setStep((s) => (s - 1) as Step))}
            >
              {step === 1 ? t('surveyInsights.customAnalysis.cancel') : t('surveyInsights.customAnalysis.prev')}
            </Button>
            {step < 3 ? (
              <Button onClick={() => setStep((s) => (s + 1) as Step)}>
                {t('surveyInsights.customAnalysis.next')}
              </Button>
            ) : (
              <Button onClick={handleConfirm}>
                <Icon name="auto_awesome" size={16} className="mr-1.5" />
                {t('surveyInsights.customAnalysis.confirm')}
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Past reports */}
      {surveyId && <PastReports surveyId={surveyId} />}
    </div>
  );
}
