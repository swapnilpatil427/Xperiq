import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card } from '@/components/ui/card';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { PageHeader } from '../../components/PageHeader';
import { PrismStepper } from '../../components/prism/PrismStepper';
import { MappingTable } from '../../components/prism/MappingTable';
import { DryRunDiff } from '../../components/prism/DryRunDiff';
import { ImportProgress } from '../../components/prism/ImportProgress';
import { PrismProcessing } from '../../components/prism/PrismProcessing';
import { ReconciliationPanel } from '../../components/prism/ReconciliationPanel';
import { parityAcknowledged, type MetricMethod } from '../../components/prism/ParityCheck';
import { LiveDot } from '../insights/shared';
import { useApi } from '../../hooks/useApi';
import { usePrismJob } from '../../hooks/usePrismJob';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useTranslation } from '../../lib/i18n';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { invalidate } from '../../lib/dataBus';
import { ROUTES, toPath } from '../../constants/routes';
import { cn } from '@/lib/utils';
import type {
  PrismStage, PrismWizardStep, FieldMapping, DryRunReport, ReconReport,
  DiscoveredResource, ResourceRef,
} from '../../types/prism';

// Collapse the fine-grained backend stage → the 6-step wizard.
const STAGE_TO_STEP: Record<PrismStage, PrismWizardStep> = {
  connect: 'connect', discover: 'select', extract: 'select', profile: 'map',
  map: 'map', transform: 'review', dryrun: 'review', load: 'import',
  reconcile: 'import', enrich: 'done', publish: 'done',
};

// Background (automatic) stages — the server works through these without user
// input. Interactive pause points (select-after-discover, map, review-at-dryrun)
// only apply when status === 'awaiting_input'.
const BACKGROUND_STAGES: PrismStage[] = [
  'connect', 'discover', 'extract', 'profile', 'transform', 'load', 'reconcile', 'enrich', 'publish',
];
// Live-import stages get the richer ImportProgress view; the rest get PrismProcessing.
const IMPORT_PROGRESS_STAGES: PrismStage[] = ['load', 'reconcile'];

const prefersReducedMotion = typeof window !== 'undefined'
  && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ── Small reusable state primitives ──────────────────────────────────────────

/** Skeleton block shown while a per-stage fetch is in flight. */
function StageSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      <div className="skeleton h-6 w-48 rounded-xl" />
      <div className="skeleton h-40 rounded-2xl" />
      <div className="skeleton h-10 w-full rounded-xl" />
    </div>
  );
}

/** Inline error for a per-stage fetch, with a Retry that re-runs that fetch. */
function StageErrorInline({ message, onRetry }: { message: string; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="p-5 space-y-3">
      <p className="text-sm font-medium text-destructive flex items-center gap-2">
        <Icon name="error" size={16} />{message}
      </p>
      <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onRetry}>
        <Icon name="refresh" size={14} />{t('prism.common.retry')}
      </Button>
    </Card>
  );
}

export function PrismJobPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const api = useApi();
  const { jobId = '' } = useParams<{ jobId: string }>();
  useSetPageTitle(t('prism.title'));

  const { job, loading, error, reload, pause, resume, cancel } = usePrismJob(jobId);
  const { openCrystal, setScope } = useCrystalPanel();

  // Scope Crystal to this connection while on the wizard (for the Map "Ask Crystal").
  useEffect(() => {
    if (job?.connection_id) setScope(job.connection_id);
    return () => setScope('all');
  }, [job?.connection_id, setScope]);

  const step: PrismWizardStep = job ? STAGE_TO_STEP[job.stage] : 'connect';
  const status = job?.status;
  const isAwaitingInput = status === 'awaiting_input';

  // ── Stage-local state ────────────────────────────────────────────────────────
  const [resources, setResources] = useState<DiscoveredResource[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [includeDirectory, setIncludeDirectory] = useState(true);
  const [includeDistributions, setIncludeDistributions] = useState(true);
  const [includePartials, setIncludePartials] = useState(true);
  const [resourcesLoaded, setResourcesLoaded] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const [resourcesError, setResourcesError] = useState<string | null>(null);

  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [mappingsLoaded, setMappingsLoaded] = useState(false);
  const [loadingMappings, setLoadingMappings] = useState(false);
  const [mappingsError, setMappingsError] = useState<string | null>(null);

  const [dryRun, setDryRun] = useState<DryRunReport | null>(null);
  const [loadingDryRun, setLoadingDryRun] = useState(false);
  const [dryRunError, setDryRunError] = useState<string | null>(null);
  const [methods, setMethods] = useState<Record<string, MetricMethod>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [typeConfirm, setTypeConfirm] = useState('');
  const [approving, setApproving] = useState(false);

  const [recon, setRecon] = useState<ReconReport | null>(null);
  const [loadingRecon, setLoadingRecon] = useState(false);
  const [reconError, setReconError] = useState<string | null>(null);
  const [stageError, setStageError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // ── Per-stage fetchers (also used as Retry handlers) ─────────────────────────
  const loadResources = useCallback(() => {
    if (!job) return;
    setLoadingResources(true); setResourcesError(null);
    api.discoverPrismResources(job.connection_id)
      .then((r) => {
        setResources(r.resources);
        setSelected(new Set(r.resources.map((x) => x.resourceRef.id)));
        setResourcesLoaded(true);
      })
      .catch((e) => setResourcesError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingResources(false));
  }, [api, job]);

  const loadMappings = useCallback(() => {
    if (!job) return;
    setLoadingMappings(true); setMappingsError(null);
    api.getPrismMapping(job.id)
      .then((r) => { setMappings(r.mappings); setMappingsLoaded(true); })
      .catch((e) => setMappingsError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingMappings(false));
  }, [api, job]);

  const loadDryRun = useCallback(() => {
    if (!job) return;
    setLoadingDryRun(true); setDryRunError(null);
    api.getPrismDryRun(job.id)
      .then((r) => setDryRun(r))
      .catch((e) => setDryRunError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingDryRun(false));
  }, [api, job]);

  const loadRecon = useCallback(() => {
    if (!job) return;
    setLoadingRecon(true); setReconError(null);
    api.getPrismReconciliation(job.id)
      .then((r) => setRecon(r))
      .catch((e) => setReconError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoadingRecon(false));
  }, [api, job]);

  // Per-stage data is only needed for the interactive steps, and only once the
  // server is actually awaiting input on that step (not while it is still
  // working a background stage that happens to collapse to the same wizard step).
  useEffect(() => {
    if (step === 'select' && isAwaitingInput && job && !resourcesLoaded && !loadingResources && !resourcesError) loadResources();
  }, [step, isAwaitingInput, job, resourcesLoaded, loadingResources, resourcesError, loadResources]);

  useEffect(() => {
    if (step === 'map' && isAwaitingInput && job && !mappingsLoaded && !loadingMappings && !mappingsError) loadMappings();
  }, [step, isAwaitingInput, job, mappingsLoaded, loadingMappings, mappingsError, loadMappings]);

  useEffect(() => {
    if (step === 'review' && isAwaitingInput && job && !dryRun && !loadingDryRun && !dryRunError) loadDryRun();
  }, [step, isAwaitingInput, job, dryRun, loadingDryRun, dryRunError, loadDryRun]);

  useEffect(() => {
    if (step === 'done' && job && !recon && !loadingRecon && !reconError) loadRecon();
  }, [step, job, recon, loadingRecon, reconError, loadRecon]);

  const connectionLabel = job?.connection_id ?? '';
  const selectedResources: ResourceRef[] = useMemo(
    () => resources.filter((r) => selected.has(r.resourceRef.id)).map((r) => r.resourceRef),
    [resources, selected],
  );

  const parityOk = dryRun ? parityAcknowledged(dryRun.metric_parity, methods) : false;
  const conflictsResolved = dryRun ? dryRun.summary.conflict === 0 : false;
  const totalToWrite = dryRun ? dryRun.summary.create + dryRun.summary.update : 0;

  // ── Stage transitions ──────────────────────────────────────────────────────
  async function continueFromSelect() {
    if (!job) return;
    setBusy(true); setStageError(null);
    try {
      await api.createPrismJob({
        connectionId: job.connection_id,
        kind: job.kind,
        resources: selectedResources,
        options: { include_partials: includePartials },
      });
      await reload();
      invalidate('prism');
    } catch (e) {
      setStageError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function continueFromMap() {
    if (!job) return;
    setBusy(true); setStageError(null);
    try {
      await api.putPrismMapping(job.id, { mappings });
      await reload();
      invalidate('prism');
    } catch (e) {
      setStageError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  async function handleApprove() {
    if (!job) return;
    setApproving(true); setStageError(null);
    try {
      await api.approvePrismJob(job.id, { metricMethods: methods });
      setConfirmOpen(false);
      await reload();
      invalidate('prism');
    } catch (e) {
      setStageError(e instanceof Error ? e.message : String(e));
    } finally { setApproving(false); }
  }

  function toggleResource(id: string) {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  // ── Status-aware view router ─────────────────────────────────────────────────
  // The body is decided from BOTH job.stage AND job.status so the page is NEVER
  // blank: every (stage × status) combination resolves to exactly one view.
  type BodyView =
    | 'select' | 'map' | 'review' | 'done'        // interactive / terminal-success
    | 'importProgress' | 'processing'             // background work
    | 'paused' | 'failed' | 'partial' | 'fallback';

  function resolveView(): BodyView {
    if (!job) return 'processing'; // pre-job (fresh connect) — never blank
    const isBackgroundStage = BACKGROUND_STAGES.includes(job.stage);
    const isImportStage = IMPORT_PROGRESS_STAGES.includes(job.stage);

    switch (job.status) {
      case 'failed':
        return 'failed';
      case 'partial':
        // Surface the partial result on the live-import view (it has the banner)
        // or as a standalone partial card for other stages.
        return isImportStage ? 'importProgress' : 'partial';
      case 'paused':
        // Import stages keep the rich progress card (it has Resume); others get a
        // simple paused card.
        return isImportStage ? 'importProgress' : 'paused';
      case 'complete':
        return 'done';
      case 'awaiting_input':
        // Interactive pause point — render the wizard step for this stage.
        if (step === 'select') return 'select';
        if (step === 'map') return 'map';
        if (step === 'review') return 'review';
        if (step === 'done') return 'done';
        return 'fallback';
      case 'queued':
      case 'running':
        if (isImportStage) return 'importProgress';
        if (isBackgroundStage) return 'processing';
        return 'fallback';
      default:
        return 'fallback';
    }
  }

  const view: BodyView = resolveView();

  if (loading && !job) {
    return (
      <div className="max-w-5xl mx-auto w-full">
        <div className="skeleton h-8 w-48 rounded-xl mt-10 mb-6" />
        <div className="skeleton h-64 rounded-2xl" />
      </div>
    );
  }

  if (error && !job) {
    return (
      <div className="max-w-5xl mx-auto w-full">
        <PageHeader crumbs={[{ label: t('prism.title'), path: ROUTES.PRISM }, { label: jobId }]} title={t('prism.title')} />
        <Card className="p-6 space-y-4 mt-2">
          <div className="flex items-start gap-3">
            <Icon name="error" size={22} className="text-destructive shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-extrabold font-headline text-on-surface">{t('prism.state.loadErrorTitle')}</h2>
              <p className="text-sm text-on-surface-variant mt-1">{error}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default" className="rounded-xl gap-1.5" onClick={() => reload()}>
              <Icon name="refresh" size={14} />{t('prism.state.retryLoading')}
            </Button>
            <Button variant="ghost" className="rounded-xl gap-1.5" onClick={() => navigate(ROUTES.PRISM)}>
              <Icon name="arrow_back" size={14} />{t('prism.state.backToPrism')}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full">
      <PageHeader
        crumbs={[{ label: t('prism.title'), path: ROUTES.PRISM }, { label: connectionLabel }]}
        title={t('prism.title')}
      />

      <PrismStepper current={step} />

      {stageError && (
        <div className="rounded-xl px-4 py-3 bg-destructive/10 text-destructive text-sm font-medium mb-4 flex items-center gap-2">
          <Icon name="error" size={16} />{stageError}
        </div>
      )}

      {/* ── Select (awaiting_input @ discover/extract) ── */}
      {view === 'select' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold font-headline text-on-surface">{t('prism.select.title')}</h2>
            <span className="text-sm text-on-surface-variant">{t('prism.select.selectedSummary', { count: selected.size })}</span>
          </div>

          {resourcesError ? (
            <StageErrorInline message={resourcesError} onRetry={loadResources} />
          ) : loadingResources || !resourcesLoaded ? (
            <StageSkeleton />
          ) : resources.length === 0 ? (
            <p className="text-sm text-on-surface-variant">{t('prism.select.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead scope="col" className="w-10" />
                  <TableHead scope="col">{t('prism.select.colName')}</TableHead>
                  <TableHead scope="col">{t('prism.select.colCount')}</TableHead>
                  <TableHead scope="col">{t('prism.select.colRange')}</TableHead>
                  <TableHead scope="col">{t('prism.select.colMetric')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resources.map((r) => {
                  const id = r.resourceRef.id;
                  const checked = selected.has(id);
                  return (
                    <TableRow key={id}>
                      <TableCell>
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={r.label}
                          onClick={() => toggleResource(id)}
                          className={cn('w-5 h-5 rounded flex items-center justify-center', checked ? 'bg-primary' : 'border border-border')}
                        >
                          {checked && <Icon name="check" size={12} style={{ color: '#fff' }} />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium text-on-surface">{r.label}</TableCell>
                      <TableCell className="tabular-nums">{r.counts != null ? r.counts.toLocaleString() : '—'}</TableCell>
                      <TableCell className="text-on-surface-variant">{r.dateRange ? `${r.dateRange.start} – ${r.dateRange.end}` : '—'}</TableCell>
                      <TableCell>{r.metric ? <span className="text-xs font-bold uppercase">{r.metric}</span> : '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}

          <Card className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">{t('prism.select.includeDirectory')}</span>
              <Switch checked={includeDirectory} onCheckedChange={setIncludeDirectory} aria-label={t('prism.select.includeDirectory')} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">{t('prism.select.includeDistributions')}</span>
              <Switch checked={includeDistributions} onCheckedChange={setIncludeDistributions} aria-label={t('prism.select.includeDistributions')} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-on-surface">{t('prism.select.includePartials')}</span>
              <Switch checked={includePartials} onCheckedChange={setIncludePartials} aria-label={t('prism.select.includePartials')} />
            </div>
          </Card>

          <div className="flex items-center justify-end gap-3">
            <Button variant="ghost" className="rounded-xl" onClick={() => navigate(ROUTES.PRISM)}>{t('prism.select.back')}</Button>
            <Button variant="default" className="rounded-xl gap-1.5" disabled={busy || selected.size === 0} onClick={continueFromSelect}>
              {t('prism.select.continue')}<Icon name="arrow_forward" size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Map (awaiting_input @ map) ── */}
      {view === 'map' && (
        <div className="space-y-5">
          <h2 className="text-base font-extrabold font-headline text-on-surface">{t('prism.map.title')}</h2>
          {mappingsError ? (
            <StageErrorInline message={mappingsError} onRetry={loadMappings} />
          ) : loadingMappings || !mappingsLoaded ? (
            <StageSkeleton />
          ) : (
            <MappingTable mappings={mappings} onChange={setMappings} />
          )}
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
              onClick={() => openCrystal()}
            >
              <Icon name="auto_awesome" size={15} />{t('prism.map.askCrystal')}
            </button>
            <div className="flex items-center gap-3">
              <Button variant="ghost" className="rounded-xl" onClick={() => reload()}>{t('prism.map.back')}</Button>
              <Button variant="default" className="rounded-xl gap-1.5" disabled={busy || !mappingsLoaded} onClick={continueFromMap}>
                {t('prism.map.continue')}<Icon name="arrow_forward" size={16} />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Review (awaiting_input @ dryrun — dry-run diff, trust hero) ── */}
      {view === 'review' && (
        <div className="space-y-5">
          <h2 className="text-base font-extrabold font-headline text-on-surface">{t('prism.review.bannerTitle')}</h2>
          {dryRunError ? (
            <StageErrorInline message={dryRunError} onRetry={loadDryRun} />
          ) : loadingDryRun || !dryRun ? (
            <StageSkeleton />
          ) : (
            <>
              <DryRunDiff
                report={dryRun}
                methods={methods}
                onChooseMethod={(metric, method) => setMethods((prev) => ({ ...prev, [metric]: method }))}
              />
              {!parityOk && dryRun.metric_parity.some((p) => !p.match) && (
                <p className="text-xs font-semibold text-warning flex items-center gap-1.5">
                  <Icon name="warning" size={14} />{t('prism.review.parityAckRequired')}
                </p>
              )}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
                  <Icon name="warning" size={15} className="text-warning" />
                  {t('prism.review.writeWarning', { count: totalToWrite.toLocaleString(), target: connectionLabel })}
                </p>
                <div className="flex items-center gap-3">
                  <Button variant="ghost" className="rounded-xl" onClick={() => reload()}>{t('prism.review.back')}</Button>
                  <Button
                    variant="gradient"
                    className="rounded-xl gap-1.5"
                    disabled={!parityOk || !conflictsResolved}
                    onClick={() => { setTypeConfirm(''); setConfirmOpen(true); }}
                  >
                    {t('prism.review.approve')}<Icon name="arrow_forward" size={16} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Import (live load/reconcile progress; also covers paused/partial here) ── */}
      {view === 'importProgress' && job && (
        <ImportProgress
          job={job}
          label={connectionLabel}
          prefersReducedMotion={!!prefersReducedMotion}
          onRunInBackground={() => navigate(ROUTES.PRISM)}
          onPause={pause}
          onResume={resume}
          onCancel={cancel}
          onViewErrors={() => navigate(ROUTES.PRISM_JOBS)}
        />
      )}

      {/* ── Processing (background stage, queued/running, incl. fresh `connect`) ── */}
      {view === 'processing' && (
        job ? (
          <PrismProcessing
            job={job}
            label={connectionLabel}
            prefersReducedMotion={!!prefersReducedMotion}
            onRunInBackground={() => navigate(ROUTES.PRISM)}
            onPause={pause}
            onCancel={cancel}
          />
        ) : (
          // No job yet (fresh connect, still loading): a self-contained processing card.
          <Card className="p-6 space-y-3" aria-live="polite" aria-busy="true">
            <div className="flex items-center gap-3">
              {prefersReducedMotion
                ? <Icon name="sync" size={18} className="text-primary" aria-label={t('prism.processing.ariaBusy')} />
                : <span role="status" aria-label={t('prism.processing.ariaBusy')}><LiveDot color="var(--color-primary)" size={10} /></span>}
              <p className="text-sm font-semibold text-on-surface">{t('prism.processing.headline.connect')}</p>
            </div>
            <p className="text-sm text-on-surface-variant">{t('prism.processing.safeToLeave')}</p>
          </Card>
        )
      )}

      {/* ── Paused (non-import background stage) ── */}
      {view === 'paused' && job && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Icon name="pause_circle" size={22} className="text-on-surface-variant shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-extrabold font-headline text-on-surface">{t('prism.state.pausedTitle')}</h2>
              <p className="text-sm text-on-surface-variant mt-1">{t('prism.state.pausedBody')}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="success" className="rounded-xl gap-1.5" onClick={resume}>
              <Icon name="play_arrow" size={16} />{t('prism.state.resume')}
            </Button>
            <Button variant="ghost" className="rounded-xl gap-1.5 text-destructive" onClick={cancel}>
              <Icon name="cancel" size={16} />{t('prism.progress.cancel')}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Failed ── */}
      {view === 'failed' && job && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Icon name="error" size={22} className="text-destructive shrink-0 mt-0.5" />
            <div className="min-w-0">
              <h2 className="text-base font-extrabold font-headline text-on-surface">{t('prism.state.failedTitle')}</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                {job.error?.message ?? t('prism.state.failedBody', { stage: t(`prism.stage.${job.error?.stage ?? job.stage}`) })}
              </p>
              {job.error?.message && (
                <p className="text-xs text-on-surface-variant mt-1">
                  {t('prism.state.failedBody', { stage: t(`prism.stage.${job.error?.stage ?? job.stage}`) })}
                </p>
              )}
              {((job.counts.failed ?? 0) + (job.counts.poison ?? 0)) > 0 && (
                <p className="text-xs font-medium text-warning mt-2">
                  {t('prism.state.failedCounts', { failed: ((job.counts.failed ?? 0) + (job.counts.poison ?? 0)).toLocaleString() })}
                </p>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default" className="rounded-xl gap-1.5" onClick={() => reload()}>
              <Icon name="refresh" size={14} />{t('prism.state.retry')}
            </Button>
            <Button variant="ghost" className="rounded-xl gap-1.5" onClick={() => navigate(ROUTES.PRISM)}>
              <Icon name="arrow_back" size={14} />{t('prism.state.backToPrism')}
            </Button>
          </div>
        </Card>
      )}

      {/* ── Partial (non-import stage): imported with some errors ── */}
      {view === 'partial' && job && (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <Icon name="warning" size={22} className="text-warning shrink-0 mt-0.5" />
            <div>
              <h2 className="text-base font-extrabold font-headline text-on-surface">{t('prism.state.partialTitle')}</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                {t('prism.state.partialBody', {
                  loaded: (job.counts.loaded ?? 0).toLocaleString(),
                  failed: ((job.counts.failed ?? 0) + (job.counts.poison ?? 0)).toLocaleString(),
                })}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="default" className="rounded-xl gap-1.5" onClick={() => reload()}>
              {t('prism.state.partialContinue')}<Icon name="arrow_forward" size={16} />
            </Button>
            <button
              type="button"
              className="text-xs font-semibold text-primary hover:underline"
              onClick={() => navigate(ROUTES.PRISM_JOBS)}
            >
              {t('prism.progress.viewErrors')}
            </button>
          </div>
        </Card>
      )}

      {/* ── Guaranteed fallback — ANY unhandled stage/status ── */}
      {view === 'fallback' && job && (
        <Card className="p-6 space-y-4" aria-live="polite">
          <div className="flex items-start gap-3">
            {prefersReducedMotion
              ? <Icon name="sync" size={18} className="text-primary shrink-0 mt-0.5" aria-label={t('prism.processing.ariaBusy')} />
              : <span className="shrink-0 mt-1" role="status" aria-label={t('prism.processing.ariaBusy')}><LiveDot color="var(--color-primary)" size={10} /></span>}
            <div>
              <h2 className="text-base font-extrabold font-headline text-on-surface">{t('prism.state.genericTitle')}</h2>
              <p className="text-sm text-on-surface-variant mt-1">
                {t('prism.state.genericBody', { stage: t(`prism.stage.${job.stage}`), status: t(`prism.status.${job.status}`) })}
              </p>
            </div>
          </div>
          <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => reload()}>
            <Icon name="refresh" size={14} />{t('prism.state.refresh')}
          </Button>
        </Card>
      )}

      {/* ── Done (reconciliation + first insight) ── */}
      {view === 'done' && job && (
        <div className="space-y-5">
          <h2 className="text-base font-extrabold font-headline text-on-surface flex items-center gap-2">
            <Icon name="check_circle" size={20} className="text-success" fill={1} />
            {t('prism.done.title', { label: connectionLabel })}
          </h2>
          <p className="text-sm text-on-surface-variant">
            {t('prism.done.summary', { count: (job.counts.loaded ?? 0).toLocaleString() })}
          </p>

          {reconError ? (
            <StageErrorInline message={reconError} onRetry={loadRecon} />
          ) : recon ? (
            <ReconciliationPanel report={recon} />
          ) : (
            <div className="skeleton h-40 rounded-2xl" aria-hidden />
          )}

          <div
            className="flex items-start gap-3 rounded-2xl p-4"
            style={{ background: 'color-mix(in srgb, var(--color-tertiary) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--color-tertiary) 16%, transparent)' }}
          >
            <Icon name="auto_awesome" size={18} className="text-primary shrink-0 mt-0.5" fill={1} />
            <p className="text-sm text-on-surface">{t('prism.done.crystalGenerating')}</p>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button variant="outline" className="rounded-xl gap-1.5" onClick={() => navigate(ROUTES.PRISM)}>
              <Icon name="add" size={16} />{t('prism.done.importAnother')}
            </Button>
            <Button
              variant="gradient"
              className="rounded-xl gap-1.5"
              onClick={() => { invalidate('surveys'); invalidate('insights'); navigate(ROUTES.EXPERIENCE); }}
            >
              {t('prism.done.seeInsights')}<Icon name="arrow_forward" size={16} />
            </Button>
          </div>
        </div>
      )}

      {/* ── Point-of-no-return confirm dialog (focus-trapped Radix Dialog) ── */}
      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o && !approving) setConfirmOpen(false); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t('prism.confirmDialog.title', { count: totalToWrite.toLocaleString() })}</DialogTitle>
            <DialogDescription>
              {t('prism.confirmDialog.body', { count: totalToWrite.toLocaleString(), target: connectionLabel })}
            </DialogDescription>
          </DialogHeader>
          {/* Type-to-confirm only for very large imports (Jonah's scary-action pattern). */}
          {totalToWrite >= 10000 && (
            <div className="px-7 space-y-1.5">
              <Label htmlFor="prism-confirm">{t('prism.confirmDialog.typeToConfirm', { keyword: t('prism.confirmDialog.keyword') })}</Label>
              <Input
                id="prism-confirm"
                value={typeConfirm}
                onChange={(e) => setTypeConfirm(e.target.value)}
                placeholder={t('prism.confirmDialog.typePlaceholder')}
                autoComplete="off"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" className="rounded-xl" onClick={() => setConfirmOpen(false)} disabled={approving}>
              {t('prism.confirmDialog.cancel')}
            </Button>
            <Button
              variant="gradient"
              className="rounded-xl gap-1.5"
              disabled={approving || (totalToWrite >= 10000 && typeConfirm !== t('prism.confirmDialog.keyword'))}
              onClick={handleApprove}
            >
              {approving ? <><Icon name="sync" size={16} />{t('prism.confirmDialog.confirming')}</> : t('prism.confirmDialog.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
