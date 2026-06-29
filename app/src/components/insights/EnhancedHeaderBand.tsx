// EnhancedHeaderBand — Phase 0.5 (06_UX_DESIGN §15.1)
//
// Replaces the static NPS header row on the Intelligence page when the
// `insightsTrajectoryV1` flag is on AND a latest_checkpoint is present.
//
// Shows: live NPS + a delta chip (↓3.2 since #13, colored by trend), a row of
// count chips (▲ N emerged / ▼ N declining), a provenance line (trigger +
// relative time + checkpoint #N), and an action area: [View details →]
// [View trail] [Generate ▾] [↻ Refresh].
//
// State machine (06 §15.0):
//   - generating (runStatus === 'running') → "Analyzing…" mode
//   - bootstrap  (checkpoint #1)           → no delta chip / no topic chips
//   - legacy     (#>1, delta === null)     → NPS + provenance, no delta chip
//   - full       (#>1, delta present)      → full band

import { motion } from 'framer-motion';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTranslation } from '../../lib/i18n';
import type { LatestCheckpoint, CheckpointDelta } from '../../types';
import {
  triggerLabelKey,
  relativeAgo,
  isRecentCheckpoint,
  resolveTrendDirection,
  deltaArrow,
  formatDeltaMagnitude,
  deltaChipClasses,
} from './trajectory';

const HOUSE_EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export interface EnhancedHeaderBandProps {
  checkpoint: LatestCheckpoint;
  delta: CheckpointDelta | null;
  /** Pipeline run status from listInsights; 'running' → generating mode. */
  runStatus?: string | null;
  /** New-response count for the "Analyzing…" message (generating mode). */
  newResponseCount?: number;
  /** Phase 4 Trail flag — gates the [View trail] link. */
  showTrail?: boolean;
  onOpenDrawer: () => void;
  /** Navigate to the Trail route (Phase 4). Guarded — optional. */
  onViewTrail?: () => void;
  /** trigger: 'manual' (refresh) | 'regenerate' (full re-run). */
  onGenerate?: (trigger: 'manual' | 'regenerate') => void;
  /** Opens the Manual Run dialog (Phase 3) — adds a "Generate report…" entry. */
  onOpenManualRun?: () => void;
  /** Navigate to Custom Analysis (Phase 6) — adds a menu entry when provided. */
  onOpenCustomAnalysis?: () => void;
  /** Navigate to Intelligence settings (Phase 5) — adds a menu entry when provided. */
  onOpenSettings?: () => void;
  onRefresh?: () => void;
  /** Disables the refresh button (loading / cooldown). */
  refreshDisabled?: boolean;
  className?: string;
}

/** Resolve a customer-facing trigger label. */
function useTriggerLabel(trigger: string | null | undefined): string {
  const { t } = useTranslation();
  const key = triggerLabelKey(trigger);
  return key ? t(key) : (trigger ?? '');
}

export function EnhancedHeaderBand({
  checkpoint,
  delta,
  runStatus,
  newResponseCount = 0,
  showTrail = false,
  onOpenDrawer,
  onViewTrail,
  onGenerate,
  onOpenManualRun,
  onOpenCustomAnalysis,
  onOpenSettings,
  onRefresh,
  refreshDisabled = false,
  className,
}: EnhancedHeaderBandProps) {
  const { t } = useTranslation();
  const triggerLabel = useTriggerLabel(checkpoint.trigger);

  const isGenerating = runStatus === 'running';
  const isBootstrap = checkpoint.number === 1;
  const hasDelta = !isBootstrap && delta !== null;

  const npsDelta = delta?.nps_delta ?? null;
  const direction = resolveTrendDirection(delta);
  const arrow = deltaArrow(npsDelta);
  const magnitude = formatDeltaMagnitude(npsDelta);
  const prev = checkpoint.number - 1;

  const emergedCount = delta?.topic_changes?.emerged?.length ?? 0;
  const decliningCount = delta?.topic_changes?.resolved?.length ?? 0;

  const liveDotRecent = isGenerating || isRecentCheckpoint(checkpoint.created_at);
  const npsDisplay = checkpoint.nps != null ? Math.round(checkpoint.nps) : '—';

  // Provenance line text per state.
  const provenance = isGenerating
    ? t('surveyInsights.investigation.analysisInProgress')
    : isBootstrap
      ? t('surveyInsights.investigation.provenanceLineFirst', {
          checkpoint: checkpoint.number,
          responses: checkpoint.new_responses ?? newResponseCount ?? 0,
        })
      : t('surveyInsights.investigation.provenanceLine', {
          ago: relativeAgo(checkpoint.created_at),
          trigger: triggerLabel,
          checkpoint: checkpoint.number,
          newResponses: checkpoint.new_responses ?? 0,
        });

  // a11y for the delta chip.
  const directionWord =
    direction === 'up'
      ? t('surveyInsights.investigation.directionUp')
      : direction === 'down'
        ? t('surveyInsights.investigation.directionDown')
        : t('surveyInsights.investigation.directionStable');
  const deltaChipAria =
    direction === 'stable'
      ? t('surveyInsights.investigation.deltaChipAriaLabelStable', { prev })
      : t('surveyInsights.investigation.deltaChipAriaLabel', {
          direction: directionWord,
          delta: magnitude,
          prev,
        });

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: HOUSE_EASE }}
      className={
        'bg-zinc-900 border border-zinc-800 rounded-2xl px-6 py-5 w-full mb-6 ' +
        (className ?? '')
      }
    >
      {/* Provenance row */}
      <div
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono mb-4"
      >
        <span
          className={
            'w-1.5 h-1.5 rounded-full bg-zinc-500/60 shrink-0 ' +
            (liveDotRecent ? 'animate-pulse' : '')
          }
          aria-hidden="true"
        />
        <span className="truncate">{provenance}</span>
      </div>

      {/* Main row */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        {/* NPS block */}
        <div>
          {isGenerating ? (
            <div className="text-xs text-zinc-400 animate-pulse font-mono mb-2">
              {t('surveyInsights.investigation.analyzingResponses', {
                count: newResponseCount,
              })}
            </div>
          ) : (
            hasDelta && (
              <button
                type="button"
                onClick={onOpenDrawer}
                aria-label={deltaChipAria}
                className={
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold mb-2 ' +
                  'border cursor-pointer transition-colors duration-150 ' +
                  deltaChipClasses(npsDelta)
                }
              >
                {arrow && <span aria-hidden="true">{arrow}</span>}
                <span aria-hidden="true">
                  {t('surveyInsights.investigation.deltaSince', {
                    arrow: '',
                    delta: magnitude,
                    prev,
                  })}
                </span>
              </button>
            )
          )}
          <div className="text-7xl font-black text-zinc-100 leading-none tabular-nums">
            {npsDisplay}
          </div>
          <div className="text-xs text-zinc-400 font-medium mt-1">
            {t('surveyInsights.investigation.npsLabel')}
          </div>
        </div>

        {/* Right action area */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Count chips (hidden while generating) */}
          {!isGenerating && hasDelta && emergedCount > 0 && (
            <span
              role="status"
              aria-label={t('surveyInsights.investigation.topicCountAriaLabel', {
                count: emergedCount,
                direction: t('surveyInsights.investigation.emerged'),
              })}
              className="rounded-full px-3 py-1 text-xs font-medium bg-emerald-950 text-emerald-500 border border-emerald-500/20 cursor-default opacity-75"
            >
              <span aria-hidden="true">▲ </span>
              {t('surveyInsights.investigation.countEmerged', { count: emergedCount })}
            </span>
          )}
          {!isGenerating && hasDelta && decliningCount > 0 && (
            <span
              role="status"
              aria-label={t('surveyInsights.investigation.topicCountAriaLabel', {
                count: decliningCount,
                direction: t('surveyInsights.investigation.declining'),
              })}
              className="rounded-full px-3 py-1 text-xs font-medium bg-rose-950 text-rose-500 border border-rose-500/20 cursor-default opacity-75"
            >
              <span aria-hidden="true">▼ </span>
              {t('surveyInsights.investigation.countDeclining', { count: decliningCount })}
            </span>
          )}

          {/* View details (hidden while generating) */}
          {!isGenerating && (
            <button
              type="button"
              onClick={onOpenDrawer}
              aria-label={t('surveyInsights.investigation.viewDetailsAriaLabel', {
                checkpoint: checkpoint.number,
              })}
              className="text-sm text-violet-400 font-medium hover:text-violet-300 transition-colors flex items-center gap-1"
            >
              {t('surveyInsights.investigation.viewDetails')}
            </button>
          )}

          <span className="text-zinc-700" aria-hidden="true">|</span>

          {/* View trail — Phase 4. Grayed w/ tooltip when flag off. */}
          {showTrail ? (
            <button
              type="button"
              onClick={onViewTrail}
              className="text-sm text-zinc-400 font-medium hover:text-zinc-200 transition-colors flex items-center gap-1"
            >
              {t('surveyInsights.investigation.viewTrail')}
            </button>
          ) : (
            <span
              className="text-sm text-zinc-600 font-medium flex items-center gap-1 cursor-not-allowed"
              title={t('surveyInsights.investigation.viewTrailComingSoon')}
            >
              {t('surveyInsights.investigation.viewTrail')}
            </span>
          )}

          {/* Generate dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="text-sm text-zinc-300 font-medium hover:text-zinc-100 transition-colors flex items-center gap-1"
            >
              {t('surveyInsights.investigation.generate')}
              <span aria-hidden="true">▾</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onOpenManualRun && (
                <DropdownMenuItem onClick={onOpenManualRun}>
                  {t('surveyInsights.manualRun.title')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => onGenerate?.('regenerate')}>
                {t('surveyInsights.regenerate')}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onGenerate?.('manual')}>
                {t('surveyInsights.generate')}
              </DropdownMenuItem>
              {onOpenCustomAnalysis && (
                <DropdownMenuItem onClick={onOpenCustomAnalysis}>
                  {t('surveyInsights.investigation.menuCustomAnalysis')}
                </DropdownMenuItem>
              )}
              {onOpenSettings && (
                <DropdownMenuItem onClick={onOpenSettings}>
                  {t('surveyInsights.investigation.menuSettings')}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Refresh */}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshDisabled || isGenerating}
            aria-label={t('surveyInsights.investigation.refresh')}
            className="text-sm text-zinc-400 hover:text-zinc-100 transition-colors flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span aria-hidden="true">↻</span>
            <span className="sr-only">{t('surveyInsights.investigation.refresh')}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
