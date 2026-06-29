// InvestigationDrawer — Phase 0.5 (06_UX_DESIGN §15.2)
//
// Right-side slide-in panel (~480px) showing complete investigation details for
// the latest checkpoint:
//   A) metric trajectory sparkline (up to 5 checkpoints) + current NPS + delta
//   B) topic emergence / decline / stable lists
//   C) checkpoint provenance metadata (number, trigger, created_at, credit cost)
//   D) "Ask Crystal what changed" banner (pre-fills the Crystal panel)
//
// Built on the shadcn Sheet (Radix Dialog) for focus-trap + ESC + aria-modal.
// Handles a null `checkpoint` (loading skeleton) per the state machine.

import { LineChart, Line, ResponsiveContainer } from 'recharts';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import type { LatestCheckpoint, CheckpointDelta, RecentCheckpointPoint } from '../../types';
import {
  AUTOMATED_CHECKPOINT_CREDIT_COST,
  triggerLabelKey,
  resolveTrendDirection,
  deltaArrow,
  formatDeltaMagnitude,
} from './trajectory';

export interface InvestigationDrawerProps {
  open: boolean;
  onClose: () => void;
  checkpoint: LatestCheckpoint | null;
  delta: CheckpointDelta | null;
  /** Up to 5 prior+current checkpoints for the sparkline (chronological). */
  priorCheckpoints?: RecentCheckpointPoint[];
  /** Phase 4 Trail flag — gates the "View prior checkpoint" link. */
  showTrail?: boolean;
  /** Show the dev/admin feature-flag badge in the footer. */
  showFeatureBadge?: boolean;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ── Section A — Metric Trajectory sparkline ──────────────────────────────────
function SparklineSection({
  checkpoint,
  delta,
  priorCheckpoints,
}: {
  checkpoint: LatestCheckpoint;
  delta: CheckpointDelta | null;
  priorCheckpoints: RecentCheckpointPoint[];
}) {
  const { t } = useTranslation();
  const isBootstrap = checkpoint.number === 1;
  const points = priorCheckpoints.filter((p) => p.nps != null);
  const n = Math.min(points.length, 5);

  const npsDelta = delta?.nps_delta ?? null;
  const direction = resolveTrendDirection(delta);
  const arrow = deltaArrow(npsDelta);
  const magnitude = formatDeltaMagnitude(npsDelta);
  const npsDisplay = checkpoint.nps != null ? Math.round(checkpoint.nps) : '—';

  // Stroke color: emerald if rising, rose if falling.
  const first = points[0]?.nps ?? 0;
  const last = points[points.length - 1]?.nps ?? 0;
  const stroke = last >= first ? '#10b981' : '#f43f5e';

  const sparkAria = t('surveyInsights.investigation.sparklineAriaLabel', {
    n,
    values: points.map((p) => (p.nps != null ? Math.round(p.nps) : '—')).join(', '),
  });

  return (
    <div className="px-6 pt-5 pb-4">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-3">
        {t('surveyInsights.investigation.sectionA', { n: Math.max(n, 1) })}
      </div>

      {/* Bootstrap / no-prior-data → baseline empty state */}
      {isBootstrap || points.length === 0 ? (
        <div className="bg-zinc-900 rounded-xl px-4 py-4 flex flex-col items-center gap-2 text-center">
          <Icon name="database" size={24} style={{ color: '#52525b' }} />
          <div className="text-zinc-300 text-sm">
            {t('surveyInsights.investigation.noBaseline')}
          </div>
          <div className="text-zinc-500 text-xs">
            {t('surveyInsights.investigation.baselineCaption')}
          </div>
        </div>
      ) : points.length === 1 ? (
        <div className="bg-zinc-900 rounded-xl px-4 py-4 text-center">
          <div className="text-zinc-300 text-sm tabular-nums">
            {t('surveyInsights.investigation.sparklineSinglePoint', {
              n: points[0].number,
              val: points[0].nps != null ? Math.round(points[0].nps) : '—',
            })}
          </div>
          <div className="text-xs text-zinc-500 mt-2">
            {t('surveyInsights.investigation.noTrendYet')}
          </div>
        </div>
      ) : (
        <div
          role="img"
          aria-label={sparkAria}
          className="bg-zinc-900 rounded-xl px-3 py-2 mb-4 h-24"
        >
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <Line
                type="monotone"
                dataKey="nps"
                stroke={stroke}
                strokeWidth={2}
                dot={{ r: 3, fill: stroke }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Current NPS + delta */}
      {!isBootstrap && (
        <div className="mt-3">
          <div className="flex items-baseline gap-3">
            <span className="text-5xl font-black text-zinc-100 tabular-nums leading-none">
              {npsDisplay}
            </span>
            {npsDelta != null && (
              <span
                className={
                  'text-2xl font-bold ' +
                  (direction === 'down'
                    ? 'text-rose-400'
                    : direction === 'up'
                      ? 'text-emerald-400'
                      : 'text-zinc-400')
                }
              >
                <span aria-hidden="true">
                  {t('surveyInsights.investigation.deltaPoints', { arrow, delta: magnitude })}
                </span>
                <span className="sr-only">
                  {direction === 'down'
                    ? t('surveyInsights.investigation.directionDown')
                    : direction === 'up'
                      ? t('surveyInsights.investigation.directionUp')
                      : t('surveyInsights.investigation.directionStable')}{' '}
                  {magnitude}
                </span>
              </span>
            )}
          </div>
          <div className="text-xs text-zinc-500 mt-1">
            {t('surveyInsights.investigation.metricNPS')}
          </div>
        </div>
      )}

      {/* CSAT / CES row when present */}
      {(checkpoint.csat != null || checkpoint.ces != null) && (
        <div className="bg-zinc-900 rounded-xl px-4 py-3 mt-3 flex flex-col gap-2">
          {checkpoint.csat != null && (
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">{t('surveyInsights.investigation.metricCSAT')}</span>
              <span className="text-zinc-100 font-mono tabular-nums">
                {checkpoint.csat.toFixed(1)} / 5.0
              </span>
            </div>
          )}
          {checkpoint.ces != null && (
            <div className="flex justify-between text-xs">
              <span className="text-zinc-400">{t('surveyInsights.investigation.metricCES')}</span>
              <span className="text-zinc-100 font-mono tabular-nums">
                {checkpoint.ces.toFixed(1)} / 7.0
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section B — What changed ─────────────────────────────────────────────────
function WhatChangedSection({
  checkpoint,
  delta,
}: {
  checkpoint: LatestCheckpoint;
  delta: CheckpointDelta | null;
}) {
  const { t } = useTranslation();
  const isBootstrap = checkpoint.number === 1;
  const emerged = delta?.topic_changes?.emerged ?? [];
  const declining = delta?.topic_changes?.resolved ?? [];
  const stableCount = delta?.topic_changes?.persisted?.length ?? 0;

  return (
    <div className="px-6 py-5 border-t border-zinc-800/60">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
        {t('surveyInsights.investigation.sectionB')}
      </div>

      {isBootstrap || delta === null ? (
        <div>
          <div className="text-2xl text-zinc-600">—</div>
          <div className="text-xs text-zinc-500 mt-1">
            {delta === null && !isBootstrap
              ? t('surveyInsights.investigation.noChangeDataLegacy')
              : t('surveyInsights.investigation.noChangeData')}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {emerged.length > 0 && (
            <div>
              <div className="text-xs text-zinc-500 mb-2">
                {t('surveyInsights.investigation.topicsEmerged')}
              </div>
              <div className="flex flex-wrap gap-2">
                {emerged.map((topicName) => (
                  <span
                    key={`emerged-${topicName}`}
                    className="rounded-full px-3 py-1 text-xs font-medium border border-violet-500/40 bg-violet-500/10 text-violet-300"
                  >
                    <span aria-hidden="true">▲ </span>
                    {topicName}
                  </span>
                ))}
              </div>
            </div>
          )}
          {declining.length > 0 && (
            <div>
              <div className="text-xs text-zinc-500 mb-2">
                {t('surveyInsights.investigation.topicsDeclining')}
              </div>
              <div className="flex flex-wrap gap-2">
                {declining.map((topicName) => (
                  <span
                    key={`declining-${topicName}`}
                    className="rounded-full px-3 py-1 text-xs font-medium border border-rose-500/40 bg-rose-500/10 text-rose-400"
                  >
                    <span aria-hidden="true">▼ </span>
                    {topicName}
                  </span>
                ))}
              </div>
            </div>
          )}
          {stableCount > 0 && (
            <div className="text-sm text-zinc-300">
              {t('surveyInsights.investigation.topicsStable', { n: stableCount })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Section C — Provenance ───────────────────────────────────────────────────
function ProvenanceSection({ checkpoint }: { checkpoint: LatestCheckpoint }) {
  const { t } = useTranslation();
  const key = triggerLabelKey(checkpoint.trigger);
  const triggerLabel = key ? t(key) : (checkpoint.trigger ?? '—');

  const rows: Array<{ label: string; value: string }> = [
    { label: t('surveyInsights.investigation.provenanceCheckpoint'), value: `#${checkpoint.number}` },
    { label: t('surveyInsights.investigation.provenanceGenerated'), value: formatTimestamp(checkpoint.created_at) },
    { label: t('surveyInsights.investigation.provenanceTrigger'), value: triggerLabel },
    { label: t('surveyInsights.investigation.provenanceNewResponses'), value: String(checkpoint.new_responses ?? '—') },
    {
      label: t('surveyInsights.investigation.provenanceCreditCost'),
      value: t('surveyInsights.investigation.provenanceCreditCostValue', {
        cost: AUTOMATED_CHECKPOINT_CREDIT_COST,
      }),
    },
    { label: t('surveyInsights.investigation.provenanceModel'), value: checkpoint.model ?? '—' },
  ];

  return (
    <div className="px-6 py-5 border-t border-zinc-800/60">
      <div className="text-xs font-medium text-zinc-400 uppercase tracking-wider mb-4">
        {t('surveyInsights.investigation.sectionC')}
      </div>
      <dl className="bg-zinc-900 rounded-xl overflow-hidden divide-y divide-zinc-800">
        {rows.map((row) => (
          <div key={row.label} className="px-4 py-3 flex justify-between items-center">
            <dt className="text-xs text-zinc-400">{row.label}</dt>
            <dd className="text-xs text-zinc-100 font-mono">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

// ── Section D — Crystal banner ───────────────────────────────────────────────
function CrystalBannerSection({ checkpoint }: { checkpoint: LatestCheckpoint }) {
  const { t } = useTranslation();
  const { openCrystal } = useCrystalPanel();
  const prev = checkpoint.number - 1;

  return (
    <div className="px-6 py-4 border-t border-zinc-800/60">
      <button
        type="button"
        onClick={() =>
          openCrystal(t('surveyInsights.investigation.crystalPreFill', { prev }))
        }
        aria-label={t('surveyInsights.investigation.crystalBannerAriaLabel', { prev })}
        className="w-full bg-violet-500/8 border border-violet-500/25 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-violet-500/14 transition-colors duration-150 group text-left"
      >
        <Icon name="hexagon" size={18} style={{ color: '#c4b5fd' }} />
        <span className="text-sm text-violet-300">
          {t('surveyInsights.investigation.crystalBanner')}
        </span>
      </button>
    </div>
  );
}

export function InvestigationDrawer({
  open,
  onClose,
  checkpoint,
  delta,
  priorCheckpoints = [],
  showFeatureBadge = false,
}: InvestigationDrawerProps) {
  const { t } = useTranslation();

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent
        side="right"
        aria-labelledby="inv-drawer-title"
        className="w-screen md:w-[480px] md:max-w-none p-0 bg-zinc-950 border-l border-zinc-800 overflow-y-auto flex flex-col"
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 px-6 pt-6 pb-4 z-10 border-b border-zinc-800">
          <h2 id="inv-drawer-title" className="text-lg font-semibold text-zinc-100">
            {checkpoint
              ? t('surveyInsights.investigation.drawerTitle')
              : t('surveyInsights.investigation.loading')}
          </h2>
        </div>

        {/* Null checkpoint → loading skeleton (States 1 & 2) */}
        {!checkpoint ? (
          <div className="px-6 pt-4">
            <div className="animate-pulse rounded-lg bg-zinc-800 h-24 mt-4" />
            <div className="animate-pulse rounded-lg bg-zinc-800 h-16 mt-4" />
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            <SparklineSection
              checkpoint={checkpoint}
              delta={delta}
              priorCheckpoints={priorCheckpoints}
            />
            <WhatChangedSection checkpoint={checkpoint} delta={delta} />
            <ProvenanceSection checkpoint={checkpoint} />
            <CrystalBannerSection checkpoint={checkpoint} />

            {/* Footer feature-flag badge (dev / admin only) */}
            {showFeatureBadge && (
              <div className="px-6 py-4 mt-auto border-t border-zinc-800">
                <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600 font-mono bg-zinc-900 rounded-full px-2.5 py-1 border border-zinc-800">
                  {t('surveyInsights.investigation.featureFlag')}
                </span>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
