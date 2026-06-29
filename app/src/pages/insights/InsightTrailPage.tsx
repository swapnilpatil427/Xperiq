// InsightTrailPage — Insight Pipeline v2, Phase 4 (06_UX_DESIGN §2, §6)
//
// /app/surveys/:surveyId/intelligence/trail
//
// Paginated history of automated + manual checkpoints rendered as two vertical
// timeline lanes. Features:
//   • Lane filter (All / Automated / Manual) + date range (7/30/90/all)
//   • Consecutive non-meaningful automated runs collapse into a "N quiet
//     checkpoints" rollup (expandable)
//   • Each node shows checkpoint #, trigger, time, NPS + delta chip (trajectory
//     helpers) and emerged/declining counts
//   • Click a node → Investigation Drawer (reuses the Phase 0.5 component)
//   • Compare mode → pick two nodes → side-by-side metric + topic diff panel
//   • Manual reports surface as manual-lane nodes linking to the report viewer
//
// Cinematic house language: zinc dark surfaces, house ease curve, staggered rise.

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useApi } from '../../hooks/useApi';
import { useTranslation } from '../../lib/i18n';
import { useBreakpoint } from '../../hooks/useBreakpoint';
import { ROUTES, toPath } from '../../constants/routes';
import { getFeatureFlags } from '../../lib/features';
import { PageHeader } from '../../components/PageHeader';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { InvestigationDrawer } from '../../components/insights/InvestigationDrawer';
import { ManualRunDialog } from '../../components/insights/ManualRunDialog';
import {
  triggerLabelKey,
  relativeAgo,
  deltaArrow,
  formatDeltaMagnitude,
  deltaChipClasses,
} from '../../components/insights/trajectory';
import type {
  TrailCheckpoint,
  TrailLane,
  TrailReport,
  LatestCheckpoint,
  CheckpointComparison,
} from '../../types';

const HOUSE_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];
const PAGE_LIMIT = 25;

type LaneFilter = TrailLane | 'all';
type RangeFilter = '7d' | '30d' | '90d' | 'all';

const RANGE_DAYS: Record<RangeFilter, number | null> = {
  '7d': 7, '30d': 30, '90d': 90, all: null,
};

// ── Timeline row models — either a real node or a collapsed rollup ───────────
type Row =
  | { kind: 'node'; checkpoint: TrailCheckpoint }
  | { kind: 'rollup'; id: string; checkpoints: TrailCheckpoint[] };

/**
 * Collapse 3+ consecutive non-meaningful automated checkpoints into a rollup.
 * Meaningful nodes and manual nodes always render individually.
 */
function buildRows(checkpoints: TrailCheckpoint[]): Row[] {
  const rows: Row[] = [];
  let run: TrailCheckpoint[] = [];
  const flush = () => {
    if (run.length >= 3) {
      rows.push({ kind: 'rollup', id: `rollup-${run[0].id}`, checkpoints: run });
    } else {
      run.forEach((c) => rows.push({ kind: 'node', checkpoint: c }));
    }
    run = [];
  };
  for (const c of checkpoints) {
    const quiet = c.lane === 'automated' && !c.meaningful;
    if (quiet) {
      run.push(c);
    } else {
      flush();
      rows.push({ kind: 'node', checkpoint: c });
    }
  }
  flush();
  return rows;
}

/** Adapt a TrailCheckpoint into the LatestCheckpoint shape the drawer expects. */
function toLatestCheckpoint(c: TrailCheckpoint): LatestCheckpoint {
  return {
    number: c.number,
    nps: c.nps,
    delta: c.delta,
    meaningful: c.meaningful,
    created_at: c.created_at,
    trigger: c.trigger,
    new_responses: c.delta?.response_count_delta ?? null,
    csat: c.csat,
    ces: c.ces,
    model: null,
  };
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Delta chip ───────────────────────────────────────────────────────────────
function DeltaChip({ delta }: { delta: number | null }) {
  const { t } = useTranslation();
  if (delta == null) return null;
  const arrow = deltaArrow(delta);
  const magnitude = formatDeltaMagnitude(delta);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
        deltaChipClasses(delta),
      )}
    >
      <span aria-hidden="true">{arrow}</span>
      {t('surveyInsights.trail.deltaSince', { arrow: '', delta: magnitude })}
    </span>
  );
}

// ── A single timeline node ─────────────────────────────────────────────────────
function TrailNode({
  checkpoint,
  compareMode,
  selected,
  onOpen,
  onToggleCompare,
  onOpenReport,
}: {
  checkpoint: TrailCheckpoint;
  compareMode: boolean;
  selected: boolean;
  onOpen: () => void;
  onToggleCompare: () => void;
  onOpenReport: (reportId: string) => void;
}) {
  const { t } = useTranslation();
  const c = checkpoint;
  const isManual = c.lane === 'manual';
  const triggerKey = triggerLabelKey(c.trigger ?? c.run_mode);
  const triggerLabel = triggerKey ? t(triggerKey) : (c.trigger ?? c.run_mode ?? '');
  const emerged = c.delta?.topic_changes?.emerged?.length ?? 0;
  const declining = c.delta?.topic_changes?.resolved?.length ?? 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: HOUSE_EASE }}
      className="relative pl-8"
    >
      {/* Lane rail + dot */}
      <span
        aria-hidden="true"
        className="absolute left-2 top-0 bottom-0 w-px bg-zinc-800"
      />
      <span
        aria-hidden="true"
        className={cn(
          'absolute left-[3px] top-3 w-3 h-3 rounded-full border-2 border-zinc-950',
          isManual ? 'bg-violet-500' : c.meaningful ? 'bg-sky-500' : 'bg-zinc-600',
        )}
      />

      <div
        className={cn(
          'rounded-xl border bg-zinc-900 px-4 py-3 mb-4 transition-colors',
          selected ? 'border-violet-500 ring-1 ring-violet-500/40' : 'border-zinc-800 hover:border-zinc-700',
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-400 font-mono">
              <span className="font-semibold text-zinc-200">
                {t('surveyInsights.trail.checkpointNumber', { number: c.number })}
              </span>
              <span>·</span>
              <span>{relativeAgo(c.created_at, t)}</span>
              {triggerLabel && (<><span>·</span><span>{triggerLabel}</span></>)}
              {c.created_by && (<><span>·</span><span>{t('surveyInsights.trail.byUser', { name: c.created_by })}</span></>)}
            </div>

            {c.tier_label && (
              <span className="inline-block mt-1 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {t(`surveyInsights.trail.tier.${c.tier_label}`)}
              </span>
            )}

            {c.report_label && (
              <div className="text-sm font-medium text-zinc-100 mt-1 truncate">
                {t('surveyInsights.trail.reportLabelQuoted', { label: c.report_label })}
              </div>
            )}

            <div className="flex items-center gap-2 flex-wrap mt-2">
              <span className="text-sm font-bold text-zinc-100 tabular-nums">
                {t('surveyInsights.trail.npsValue', {
                  value: c.nps != null ? Math.round(c.nps) : '—',
                })}
              </span>
              <DeltaChip delta={c.delta?.nps_delta ?? null} />
              {emerged > 0 && (
                <span className="rounded-full bg-emerald-950 text-emerald-500 px-2 py-0.5 text-[11px] font-medium opacity-80">
                  ▲ {t('surveyInsights.trail.emergedCount', { count: emerged })}
                </span>
              )}
              {declining > 0 && (
                <span className="rounded-full bg-rose-950 text-rose-500 px-2 py-0.5 text-[11px] font-medium opacity-80">
                  ▼ {t('surveyInsights.trail.decliningCount', { count: declining })}
                </span>
              )}
            </div>

            {isManual && (c.window_start || c.window_end) && (
              <div className="text-[11px] text-zinc-500 mt-1.5">
                {t('surveyInsights.trail.windowRange', {
                  from: formatDate(c.window_start),
                  to: formatDate(c.window_end),
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {compareMode ? (
              <button
                type="button"
                data-testid={`trail-compare-${c.id}`}
                onClick={onToggleCompare}
                aria-pressed={selected}
                aria-label={t('surveyInsights.trail.selectForCompareAria', { number: c.number })}
                className={cn(
                  'w-5 h-5 rounded-md border flex items-center justify-center transition-colors',
                  selected ? 'bg-violet-500 border-violet-500' : 'border-zinc-600 hover:border-zinc-400',
                )}
              >
                {selected && <Icon name="check" size={14} className="text-white" />}
              </button>
            ) : (
              <>
                {c.report_id && (
                  <button
                    type="button"
                    onClick={() => onOpenReport(c.report_id!)}
                    className="text-xs text-violet-400 hover:text-violet-300 font-medium whitespace-nowrap"
                  >
                    {t('surveyInsights.trail.openReport')}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onOpen}
                  aria-label={t('surveyInsights.trail.nodeAriaLabel', {
                    number: c.number,
                    lane: c.lane,
                    nps: c.nps != null ? Math.round(c.nps) : '—',
                  })}
                  className="text-xs text-zinc-400 hover:text-zinc-200 font-medium whitespace-nowrap"
                >
                  {t('surveyInsights.trail.openDetail')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── A collapsed rollup of quiet checkpoints ────────────────────────────────────
function RollupRow({
  checkpoints,
  expanded,
  onToggle,
  children,
}: {
  checkpoints: TrailCheckpoint[];
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="relative pl-8">
      <span aria-hidden="true" className="absolute left-2 top-0 bottom-0 w-px bg-zinc-800" />
      <span aria-hidden="true" className="absolute left-[3px] top-3 w-3 h-3 rounded-full border-2 border-zinc-950 bg-zinc-700" />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="w-full text-left rounded-xl border border-dashed border-zinc-800 bg-zinc-900/50 px-4 py-3 mb-4 hover:border-zinc-700 transition-colors flex items-center justify-between gap-3"
      >
        <div className="text-sm text-zinc-300">
          {t('surveyInsights.trail.rollupLabel', { count: checkpoints.length })}
          <span className="text-zinc-500"> · {t('surveyInsights.trail.rollupSubLabel')}</span>
        </div>
        <span className="text-xs text-zinc-400 font-medium shrink-0">
          {expanded ? t('surveyInsights.trail.rollupCollapse') : t('surveyInsights.trail.rollupExpand')}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Compare panel ──────────────────────────────────────────────────────────────
function ComparePanel({ comparison }: { comparison: CheckpointComparison }) {
  const { t } = useTranslation();
  const { a, b, metric_deltas, topic_diff } = comparison;
  const metricRow = (labelKey: string, av: number | null, bv: number | null, dv: number | null) => (
    <div className="grid grid-cols-3 gap-2 items-center text-sm py-2 border-t border-zinc-800 first:border-t-0">
      <span className="text-zinc-400">{t(labelKey)}</span>
      <span className="text-zinc-200 tabular-nums text-center">
        {av != null ? Math.round(av) : '—'} → {bv != null ? Math.round(bv) : '—'}
      </span>
      <span className="text-right">
        <DeltaChip delta={dv} />
      </span>
    </div>
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: HOUSE_EASE }}
      className="rounded-2xl border border-violet-500/30 bg-zinc-900 p-5 mb-6"
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-zinc-100 mb-4">
        <Icon name="compare_arrows" size={18} className="text-violet-400" />
        {t('surveyInsights.trail.compareTitle')}
        <span className="text-zinc-500 font-normal">
          #{a.number} → #{b.number}
        </span>
      </div>
      <div className="mb-4">
        {metricRow('surveyInsights.trail.compareMetricNps', a.nps, b.nps, metric_deltas.nps)}
        {metricRow('surveyInsights.trail.compareMetricCsat', a.csat, b.csat, metric_deltas.csat)}
        {metricRow('surveyInsights.trail.compareMetricCes', a.ces, b.ces, metric_deltas.ces)}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            {t('surveyInsights.trail.compareTopicsAdded')}
          </div>
          {topic_diff.added.length === 0 ? (
            <div className="text-xs text-zinc-600">{t('surveyInsights.trail.compareNone')}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {topic_diff.added.map((tp) => (
                <span key={tp} className="rounded-full bg-emerald-950 text-emerald-400 px-2.5 py-1 text-xs">{tp}</span>
              ))}
            </div>
          )}
        </div>
        <div>
          <div className="text-xs text-zinc-500 uppercase tracking-wider mb-2">
            {t('surveyInsights.trail.compareTopicsRemoved')}
          </div>
          {topic_diff.removed.length === 0 ? (
            <div className="text-xs text-zinc-600">{t('surveyInsights.trail.compareNone')}</div>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {topic_diff.removed.map((tp) => (
                <span key={tp} className="rounded-full bg-rose-950 text-rose-400 px-2.5 py-1 text-xs">{tp}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── A custom analysis report card in the trail ────────────────────────────────
function CustomReportCard({ report }: { report: TrailReport }) {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: HOUSE_EASE }}
      className="relative pl-8"
    >
      <span aria-hidden="true" className="absolute left-2 top-0 bottom-0 w-px bg-zinc-800" />
      <span aria-hidden="true" className="absolute left-[3px] top-3 w-3 h-3 rounded-full border-2 border-zinc-950 bg-amber-500" />
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 mb-4 hover:border-zinc-700 transition-colors">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-400 font-mono">
              <span className="rounded-full bg-amber-950/80 text-amber-400 border border-amber-800/50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                {t('surveyInsights.trail.laneCustomHeading')}
              </span>
              <span>·</span>
              <span>{relativeAgo(report.created_at, t)}</span>
            </div>
            {report.label && (
              <div className="text-sm font-medium text-zinc-100 mt-1 truncate">
                {t('surveyInsights.trail.reportLabelQuoted', { label: report.label })}
              </div>
            )}
            {(report.sample_size != null || report.corpus_coverage_pct != null) && (
              <div className="text-[11px] text-zinc-500 mt-1">
                {t('surveyInsights.trail.customCardMeta', {
                  count: report.sample_size ?? '—',
                  pct: report.corpus_coverage_pct != null ? Math.round(report.corpus_coverage_pct) : '—',
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export function InsightTrailPage() {
  const { t } = useTranslation();
  const api = useApi();
  const navigate = useNavigate();
  const { surveyId } = useParams<{ surveyId: string }>();
  const breakpoint = useBreakpoint();
  const isMobile = breakpoint === 'mobile';
  useSetPageTitle(t('surveyInsights.trail.title'), t('surveyInsights.trail.subtitle'));

  const [lane, setLane] = useState<LaneFilter>('all');
  const [range, setRange] = useState<RangeFilter>('90d');
  const [checkpoints, setCheckpoints] = useState<TrailCheckpoint[]>([]);
  const [reports, setReports] = useState<TrailReport[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  const [drawerCheckpoint, setDrawerCheckpoint] = useState<TrailCheckpoint | null>(null);
  const [showManualDialog, setShowManualDialog] = useState(false);

  // Compare mode
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [comparison, setComparison] = useState<CheckpointComparison | null>(null);

  const [expandedRollups, setExpandedRollups] = useState<Set<string>>(new Set());

  const load = useCallback(async (reset: boolean) => {
    if (!surveyId) return;
    if (reset) { setLoading(true); setError(false); } else { setLoadingMore(true); }
    try {
      const res = await api.getInsightTrail(surveyId, {
        lane,
        limit: PAGE_LIMIT,
        cursor: reset ? null : cursor,
      });
      // Client-side range filter (backend may not honor range; this is defensive).
      const days = RANGE_DAYS[range];
      const cutoff = days != null ? Date.now() - days * 24 * 60 * 60 * 1000 : null;
      const filtered = cutoff
        ? res.checkpoints.filter((c) => new Date(c.created_at).getTime() >= cutoff)
        : res.checkpoints;
      setCheckpoints((prev) => (reset ? filtered : [...prev, ...filtered]));
      setReports((prev) => (reset ? (res.reports ?? []) : [...prev, ...(res.reports ?? [])]));
      setCursor(res.next_cursor);
    } catch {
      if (reset) setError(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [api, surveyId, lane, range, cursor]);

  // Reload from scratch on filter change.
  useEffect(() => { setCursor(null); load(true); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [lane, range, surveyId]);

  // Run the comparison whenever exactly two checkpoints are selected.
  useEffect(() => {
    if (!surveyId || compareIds.length !== 2) { setComparison(null); return; }
    let cancelled = false;
    api.compareCheckpoints(surveyId, compareIds[0], compareIds[1])
      .then((c) => { if (!cancelled) setComparison(c); })
      .catch(() => { if (!cancelled) setComparison(null); });
    return () => { cancelled = true; };
  }, [api, surveyId, compareIds]);

  const automated = useMemo(() => checkpoints.filter((c) => c.lane === 'automated'), [checkpoints]);
  const manual = useMemo(() => checkpoints.filter((c) => c.lane === 'manual'), [checkpoints]);
  const customReports = useMemo(() => reports.filter((r) => r.report_type === 'custom'), [reports]);

  // Feature flag guard — placed after all hook calls to satisfy React's Rules of Hooks
  const { insightsTrajectoryV1, showInsightTrail } = getFeatureFlags();
  if (!insightsTrajectoryV1 || !showInsightTrail) return <Navigate to={ROUTES.INSIGHTS} replace />;

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const toggleRollup = (id: string) => {
    setExpandedRollups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const openReport = (reportId: string) =>
    navigate(toPath(ROUTES.INSIGHT_REPORT, { surveyId: surveyId!, reportId }));

  const renderNode = (c: TrailCheckpoint) => (
    <TrailNode
      key={c.id}
      checkpoint={c}
      compareMode={compareMode}
      selected={compareIds.includes(c.id)}
      onOpen={() => setDrawerCheckpoint(c)}
      onToggleCompare={() => toggleCompare(c.id)}
      onOpenReport={openReport}
    />
  );

  const renderLane = (laneCheckpoints: TrailCheckpoint[], emptyKey: string) => {
    if (laneCheckpoints.length === 0) {
      return <div className="pl-8 text-sm text-zinc-600 py-2">{t(emptyKey)}</div>;
    }
    const rows = buildRows(laneCheckpoints);
    return rows.map((row) =>
      row.kind === 'node' ? (
        renderNode(row.checkpoint)
      ) : (
        <RollupRow
          key={row.id}
          checkpoints={row.checkpoints}
          expanded={expandedRollups.has(row.id)}
          onToggle={() => toggleRollup(row.id)}
        >
          {row.checkpoints.map(renderNode)}
        </RollupRow>
      ),
    );
  };

  const filterBtn = (active: boolean) =>
    cn(
      'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
      active
        ? 'border-violet-500 bg-violet-500/10 text-violet-300'
        : 'border-zinc-700 text-zinc-400 hover:bg-zinc-800',
    );

  return (
    <div className="max-w-5xl mx-auto w-full">
      <PageHeader
        crumbs={[
          { label: t('surveyInsights.trail.back'), path: toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: surveyId ?? '' }) },
          { label: t('surveyInsights.trail.title') },
        ]}
        title={t('surveyInsights.trail.title')}
        subtitle={t('surveyInsights.trail.subtitle')}
        actions={
          <Button size="sm" onClick={() => setShowManualDialog(true)} className="gap-1.5">
            <Icon name="auto_awesome" size={16} />
            {t('surveyInsights.trail.generate')}
          </Button>
        }
      />

      {/* Filters */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap" role="group" aria-label={t('surveyInsights.trail.filtersLabel')}>
          {(['all', 'automated', 'manual'] as LaneFilter[]).map((l) => (
            <button key={l} type="button" onClick={() => setLane(l)} aria-pressed={lane === l} className={filterBtn(lane === l)}>
              {t(`surveyInsights.trail.lane${l === 'all' ? 'All' : l === 'automated' ? 'Automated' : 'Manual'}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(['7d', '30d', '90d', 'all'] as RangeFilter[]).map((r) => (
            <button key={r} type="button" onClick={() => setRange(r)} aria-pressed={range === r} className={filterBtn(range === r)}>
              {t(`surveyInsights.trail.range${r === 'all' ? 'All' : r}`)}
            </button>
          ))}
          <Button
            size="sm"
            variant={compareMode ? 'default' : 'outline'}
            onClick={() => {
              setCompareMode((m) => !m);
              setCompareIds([]);
              setComparison(null);
            }}
            disabled={isMobile}
            title={isMobile ? t('surveyInsights.trail.compareDesktopOnly') : undefined}
            className="gap-1.5"
          >
            <Icon name="compare_arrows" size={15} />
            {compareMode ? t('surveyInsights.trail.compareExit') : t('surveyInsights.trail.compare')}
          </Button>
        </div>
      </div>

      {/* Compare hint / panel */}
      {compareMode && !comparison && (
        <div className="text-xs text-zinc-500 mb-4">{t('surveyInsights.trail.compareHint')}</div>
      )}
      {compareMode && comparison && <ComparePanel comparison={comparison} />}

      {/* Body */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="animate-pulse rounded-xl bg-zinc-900 h-20 ml-8" />
          ))}
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <Icon name="error" size={32} className="text-zinc-600 mx-auto" />
          <div className="font-semibold text-zinc-200 mt-3">{t('surveyInsights.trail.errorTitle')}</div>
          <p className="text-sm text-zinc-500 mt-1">{t('surveyInsights.trail.errorBody')}</p>
          <Button size="sm" variant="outline" className="mt-4" onClick={() => load(true)}>
            {t('surveyInsights.trail.retry')}
          </Button>
        </div>
      ) : checkpoints.length === 0 && manual.length === 0 ? (
        <div className="text-center py-16">
          <Icon name="timeline" size={32} className="text-zinc-600 mx-auto" />
          <div className="font-semibold text-zinc-200 mt-3">{t('surveyInsights.trail.emptyTitle')}</div>
          <p className="text-sm text-zinc-500 mt-1">{t('surveyInsights.trail.emptyBody')}</p>
        </div>
      ) : (
        <div className="space-y-8">
          {lane !== 'manual' && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-sky-400/80 mb-3 pl-8">
                {t('surveyInsights.trail.laneAutomatedHeading')}
              </h2>
              {renderLane(automated, 'surveyInsights.trail.emptyAutomated')}
            </section>
          )}
          {lane !== 'automated' && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-violet-400/80 mb-3 pl-8">
                {t('surveyInsights.trail.laneManualHeading')}
              </h2>
              {renderLane(manual, 'surveyInsights.trail.emptyManual')}
            </section>
          )}

          {customReports.length > 0 && lane !== 'automated' && lane !== 'manual' && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-400/80 mb-3 pl-8">
                {t('surveyInsights.trail.laneCustomHeading')}
              </h2>
              <div>
                {customReports.map((r) => (
                  <CustomReportCard key={r.id} report={r} />
                ))}
              </div>
            </section>
          )}

          {cursor && (
            <div className="text-center">
              <Button size="sm" variant="outline" onClick={() => load(false)} disabled={loadingMore}>
                {loadingMore ? t('surveyInsights.trail.loading') : t('surveyInsights.trail.loadMore')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Detail drawer (reuses Phase 0.5 component) */}
      <InvestigationDrawer
        open={drawerCheckpoint != null}
        onClose={() => setDrawerCheckpoint(null)}
        checkpoint={drawerCheckpoint ? toLatestCheckpoint(drawerCheckpoint) : null}
        delta={drawerCheckpoint?.delta ?? null}
        priorCheckpoints={[]}
        showTrail={false}
      />

      {/* Manual run dialog */}
      {surveyId && (
        <ManualRunDialog
          open={showManualDialog}
          onClose={() => setShowManualDialog(false)}
          surveyId={surveyId}
          onComplete={() => load(true)}
          onViewReport={(rid) => { if (rid) openReport(rid); }}
        />
      )}
    </div>
  );
}
