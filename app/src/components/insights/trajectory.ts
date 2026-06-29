// Shared helpers for the Phase 0.5 investigation-trajectory surfaces
// (EnhancedHeaderBand, InvestigationDrawer, TopicChangeBar).

import type { CheckpointDelta } from '../../types';

/** Default credit cost for an automated checkpoint (no per-checkpoint column). */
export const AUTOMATED_CHECKPOINT_CREDIT_COST = 5;

/**
 * Map an internal checkpoint trigger enum to a customer-facing locale key
 * under `surveyInsights.investigation`. Unknown values fall through to the raw
 * value (defensive — Phase 3 modes appear later).
 */
export function triggerLabelKey(trigger: string | null | undefined): string | null {
  switch (trigger) {
    case 'stream':
    case 'responses':
      return 'surveyInsights.investigation.triggerStream';
    case 'scheduler':
    case 'days':
      return 'surveyInsights.investigation.triggerScheduler';
    case 'milestone':
      return 'surveyInsights.investigation.triggerMilestone';
    case 'manual':
    case 'refresh':
      return 'surveyInsights.investigation.triggerRefresh';
    case 'manual_expert':
      return 'surveyInsights.investigation.triggerManualExpert';
    case 'manual_quick':
      return 'surveyInsights.investigation.triggerManualQuick';
    case 'api':
      return 'surveyInsights.investigation.triggerApi';
    default:
      return null; // caller shows raw value
  }
}

/**
 * Relative-time string ("2h", "3d", "just now") from an ISO timestamp.
 *
 * Accepts an optional `t` translation function. When provided the strings are
 * resolved through the i18n system (keys under `surveyInsights.trail.relativeAgo`).
 * When omitted (e.g. in pure-utility or test contexts) English strings are
 * returned directly as a fallback.
 */
export function relativeAgo(
  iso: string | null | undefined,
  t?: (key: string, opts?: Record<string, unknown>) => string,
): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = Date.now() - then;
  const sec = Math.max(0, Math.floor(diffMs / 1000));

  if (!t) {
    // Fallback English strings when no translation function is provided.
    if (sec < 60) return 'just now';
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h`;
    const day = Math.floor(hr / 24);
    if (day < 30) return `${day}d`;
    const mo = Math.floor(day / 30);
    return `${mo}mo`;
  }

  // i18n path — keys live under surveyInsights.trail.relativeAgo.
  if (sec < 60) return t('surveyInsights.trail.relativeAgo.justNow');
  const min = Math.floor(sec / 60);
  if (min < 60) return t('surveyInsights.trail.relativeAgo.minutes', { count: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('surveyInsights.trail.relativeAgo.hours', { h: hr });
  const day = Math.floor(hr / 24);
  if (day < 30) return t('surveyInsights.trail.relativeAgo.days', { d: day });
  const mo = Math.floor(day / 30);
  return t('surveyInsights.trail.relativeAgo.months', { mo });
}

/** True when the checkpoint is < 5 minutes old (drives LiveDot animation). */
export function isRecentCheckpoint(iso: string | null | undefined): boolean {
  if (!iso) return false;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return false;
  return Date.now() - then < 5 * 60 * 1000;
}

export type TrendDirection = 'up' | 'down' | 'stable';

/** Resolve the visual trend direction from a delta (prefers explicit field). */
export function resolveTrendDirection(delta: CheckpointDelta | null): TrendDirection {
  if (!delta) return 'stable';
  if (delta.trend_direction) return delta.trend_direction;
  const d = delta.nps_delta;
  if (d == null || Math.abs(d) < 2) return 'stable';
  return d > 0 ? 'up' : 'down';
}

/** Arrow glyph for a signed delta. */
export function deltaArrow(delta: number | null | undefined): string {
  if (delta == null || Math.abs(delta) < 0.05) return '';
  return delta > 0 ? '↑' : '↓';
}

/** Absolute delta formatted to one decimal place (no sign — arrow carries it). */
export function formatDeltaMagnitude(delta: number | null | undefined): string {
  if (delta == null) return '0';
  return Math.abs(delta).toFixed(1);
}

/** Delta-chip color classes keyed by NPS delta magnitude (06 §15.1c table). */
export function deltaChipClasses(delta: number | null | undefined): string {
  if (delta == null) return 'bg-zinc-800 text-zinc-400 border-zinc-700';
  if (delta < -2) return 'bg-rose-500/15 text-rose-400 border-rose-500/40 hover:bg-rose-500/25';
  if (delta > 2) return 'bg-emerald-500/15 text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/25';
  return 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:bg-zinc-700';
}
