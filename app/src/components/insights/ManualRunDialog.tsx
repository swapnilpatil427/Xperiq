// ManualRunDialog — Insight Pipeline v2, Phase 3 (06_UX_DESIGN §4)
//
// Triggered from the Intelligence header's [Generate ▾] menu (or the Trail page).
// Lets the user pick a run MODE (Expert / Quick / Refresh), a TIME WINDOW
// (presets 7/30/90/all + custom range), shows a server-computed PREVIEW
// (corpus size, credits, duration, sample size), an optional LABEL, then
// confirms → triggerManualRun → polls run-status → links to the report.
//
// Domain failures surface as ManualRunError: 402 (INSUFFICIENT_CREDITS) and
// 429 (RATE_LIMITED) render dedicated messages instead of a generic error.

import { useEffect, useState, useCallback, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Icon } from '../Icon';
import { cn } from '@/lib/utils';
import { useApi } from '../../hooks/useApi';
import { useTranslation } from '../../lib/i18n';
import { ManualRunError } from '../../lib/api';
import type { ManualRunMode, ManualRunPreview } from '../../types';

// Run-status poll cadence (mirrors InsightsDashboardPage; small + bounded).
export const MANUAL_RUN_POLL_MS = 3_000;
export const MANUAL_RUN_TIMEOUT_S = 600;

export type WindowPreset = '7d' | '30d' | '90d' | 'all' | 'custom';

export interface ManualRunDialogProps {
  open: boolean;
  onClose: () => void;
  surveyId: string;
  /** Pre-select a mode when opened (e.g. 'refresh' from the header refresh button). */
  initialMode?: ManualRunMode;
  /** Called with the report id (if any) when a run completes. */
  onComplete?: (reportId: string | null) => void;
  /** Navigate to the report / trail when the user clicks the success CTA. */
  onViewReport?: (reportId: string | null) => void;
  onViewTrail?: () => void;
}

type Phase = 'config' | 'running' | 'done' | 'error';

interface ModeMeta {
  mode: ManualRunMode;
  icon: string;
  nameKey: string;
  descKey: string;
  metaKey: string;
}

const MODES: ModeMeta[] = [
  { mode: 'expert',  icon: 'psychology',   nameKey: 'modeExpert',  descKey: 'modeExpertDesc',  metaKey: 'modeExpertMeta'  },
  { mode: 'quick',   icon: 'bolt',         nameKey: 'modeQuick',   descKey: 'modeQuickDesc',   metaKey: 'modeQuickMeta'   },
  { mode: 'refresh', icon: 'refresh',      nameKey: 'modeRefresh', descKey: 'modeRefreshDesc', metaKey: 'modeRefreshMeta' },
];

/** Resolve preset → ISO window bounds (or null for "all"). */
function presetToWindow(preset: WindowPreset, customStart: string, customEnd: string): {
  start: string | null;
  end: string | null;
} {
  if (preset === 'all') return { start: null, end: null };
  if (preset === 'custom') {
    return {
      start: customStart ? new Date(customStart).toISOString() : null,
      end: customEnd ? new Date(customEnd).toISOString() : null,
    };
  }
  const days = preset === '7d' ? 7 : preset === '30d' ? 30 : 90;
  const end = new Date();
  const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

export function ManualRunDialog({
  open,
  onClose,
  surveyId,
  initialMode = 'expert',
  onComplete,
  onViewReport,
  onViewTrail,
}: ManualRunDialogProps) {
  const { t } = useTranslation();
  const api = useApi();

  const [mode, setMode] = useState<ManualRunMode>(initialMode);
  const [preset, setPreset] = useState<WindowPreset>('30d');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [label, setLabel] = useState('');

  const [preview, setPreview] = useState<ManualRunPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewFailed, setPreviewFailed] = useState(false);

  const [phase, setPhase] = useState<Phase>('config');
  const [errorCode, setErrorCode] = useState<ManualRunError['code'] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset to a clean config state whenever the dialog (re)opens.
  useEffect(() => {
    if (open) {
      setMode(initialMode);
      setPreset(initialMode === 'refresh' ? '30d' : '30d');
      setCustomStart('');
      setCustomEnd('');
      setLabel('');
      setPhase('config');
      setErrorCode(null);
      setErrorMessage(null);
      setReportId(null);
    }
  }, [open, initialMode]);

  // Clear the poll interval on unmount / close.
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Recompute the preview when mode/window change while configuring.
  useEffect(() => {
    if (!open || phase !== 'config') return;
    let cancelled = false;
    const { start, end } = presetToWindow(preset, customStart, customEnd);
    // Custom range incomplete → skip the call.
    if (preset === 'custom' && (!start || !end)) {
      setPreview(null);
      setPreviewFailed(false);
      return;
    }
    setPreviewLoading(true);
    setPreviewFailed(false);
    api
      .previewManualRun(surveyId, { mode, window_start: start, window_end: end })
      .then((p) => { if (!cancelled) setPreview(p); })
      .catch(() => { if (!cancelled) { setPreview(null); setPreviewFailed(true); } })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [open, phase, mode, preset, customStart, customEnd, api, surveyId]);

  const startPolling = useCallback((resolvedReportId: string | null) => {
    let elapsed = 0;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      elapsed += MANUAL_RUN_POLL_MS / 1000;
      try {
        const { status } = await api.getInsightRunStatus(surveyId);
        if (status === 'completed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setPhase('done');
          onComplete?.(resolvedReportId);
          return;
        }
        if (status === 'failed') {
          if (pollRef.current) clearInterval(pollRef.current);
          setErrorMessage(t('surveyInsights.manualRun.errorFailed'));
          setPhase('error');
          return;
        }
      } catch {
        /* transient — keep polling */
      }
      if (elapsed >= MANUAL_RUN_TIMEOUT_S) {
        if (pollRef.current) clearInterval(pollRef.current);
        // Leave it running in the background; surface as done so the user can
        // open the trail to check later.
        setPhase('done');
      }
    }, MANUAL_RUN_POLL_MS);
  }, [api, surveyId, onComplete, t]);

  const handleConfirm = useCallback(async () => {
    const { start, end } = presetToWindow(preset, customStart, customEnd);
    setPhase('running');
    setErrorCode(null);
    setErrorMessage(null);
    try {
      const res = await api.triggerManualRun(surveyId, {
        mode,
        window_start: start,
        window_end: end,
        label: label.trim() || null,
      });
      const newReportId = res.report_id ?? null;
      setReportId(newReportId);
      startPolling(newReportId);
    } catch (err) {
      if (err instanceof ManualRunError) {
        setErrorCode(err.code);
        setErrorMessage(
          err.code === 'INSUFFICIENT_CREDITS'
            ? t('surveyInsights.manualRun.errorCredits')
            : err.code === 'RATE_LIMITED'
              ? t('surveyInsights.manualRun.errorRateLimited')
              : err.code === 'INSUFFICIENT_DATA'
                ? t('surveyInsights.manualRun.errorInsufficientData')
                : t('surveyInsights.manualRun.errorGeneric'),
        );
      } else {
        setErrorMessage(t('surveyInsights.manualRun.errorGeneric'));
      }
      setPhase('error');
    }
  }, [api, surveyId, mode, preset, customStart, customEnd, label, startPolling, t]);

  const customIncomplete = preset === 'custom' && (!customStart || !customEnd);
  const confirmDisabled = phase === 'running' || customIncomplete;
  const confirmLabel =
    mode === 'refresh'
      ? t('surveyInsights.manualRun.confirmRefresh')
      : t('surveyInsights.manualRun.confirm');

  const lowSample =
    preview?.sample_size != null && preview.sample_size > 0 && preview.sample_size < 30;

  const presets: WindowPreset[] = ['7d', '30d', '90d', 'all', 'custom'];
  const presetLabelKey: Record<WindowPreset, string> = {
    '7d': 'window7d',
    '30d': 'window30d',
    '90d': 'window90d',
    all: 'windowAll',
    custom: 'windowCustom',
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('surveyInsights.manualRun.title')}</DialogTitle>
          <DialogDescription>{t('surveyInsights.manualRun.description')}</DialogDescription>
        </DialogHeader>

        {(phase === 'config' || phase === 'error') && (
          <div className="px-7 pb-2 space-y-6">
            {/* Mode selector */}
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('surveyInsights.manualRun.modeLabel')}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                {MODES.map((m) => {
                  const active = mode === m.mode;
                  return (
                    <button
                      key={m.mode}
                      type="button"
                      onClick={() => setMode(m.mode)}
                      aria-pressed={active}
                      aria-label={t('surveyInsights.manualRun.modeOptionAria', {
                        mode: t(`surveyInsights.manualRun.${m.nameKey}`),
                        desc: t(`surveyInsights.manualRun.${m.descKey}`),
                      })}
                      className={cn(
                        'text-left rounded-2xl border p-3 transition-colors',
                        active
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                          : 'border-border hover:border-primary/40 hover:bg-muted/40',
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <Icon name={m.icon} size={18} className={active ? 'text-primary' : 'text-muted-foreground'} />
                        <span className="font-bold text-sm">{t(`surveyInsights.manualRun.${m.nameKey}`)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1.5">
                        {t(`surveyInsights.manualRun.${m.descKey}`)}
                      </p>
                      <p className="text-[11px] text-muted-foreground/70 mt-1 font-mono">
                        {t(`surveyInsights.manualRun.${m.metaKey}`)}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Time window */}
            <div>
              <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('surveyInsights.manualRun.windowLabel')}
              </Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {presets.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPreset(p)}
                    aria-pressed={preset === p}
                    className={cn(
                      'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors',
                      preset === p
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50',
                    )}
                  >
                    {t(`surveyInsights.manualRun.${presetLabelKey[p]}`)}
                  </button>
                ))}
              </div>
              {preset === 'custom' && (
                <div className="grid grid-cols-2 gap-3 mt-3">
                  <div>
                    <Label htmlFor="mr-from" className="text-[11px] text-muted-foreground">
                      {t('surveyInsights.manualRun.windowFrom')}
                    </Label>
                    <Input
                      id="mr-from"
                      type="date"
                      value={customStart}
                      onChange={(e) => setCustomStart(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="mr-to" className="text-[11px] text-muted-foreground">
                      {t('surveyInsights.manualRun.windowTo')}
                    </Label>
                    <Input
                      id="mr-to"
                      type="date"
                      value={customEnd}
                      onChange={(e) => setCustomEnd(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Preview */}
            <div className="rounded-2xl border border-border bg-muted/30 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
                {t('surveyInsights.manualRun.previewLabel')}
              </div>
              {previewLoading ? (
                <div className="text-sm text-muted-foreground animate-pulse">
                  {t('surveyInsights.manualRun.previewLoading')}
                </div>
              ) : previewFailed || customIncomplete ? (
                <div className="text-sm text-muted-foreground">
                  {t('surveyInsights.manualRun.previewUnavailable')}
                </div>
              ) : preview ? (
                <dl className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('surveyInsights.manualRun.previewCorpus')}</dt>
                    <dd className="font-mono tabular-nums">{(preview.corpus_size ?? 0).toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('surveyInsights.manualRun.previewSample')}</dt>
                    <dd className="font-mono tabular-nums">{(preview.sample_size ?? 0).toLocaleString()}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('surveyInsights.manualRun.previewCost')}</dt>
                    <dd className="font-mono tabular-nums">
                      {t('surveyInsights.manualRun.previewCostValue', { cost: preview.estimated_cost ?? 0 })}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">{t('surveyInsights.manualRun.previewDuration')}</dt>
                    <dd className="font-mono">{preview.estimated_duration_label || '—'}</dd>
                  </div>
                  {lowSample && (
                    <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-amber-100 text-amber-800 px-2.5 py-1 text-[11px] font-semibold">
                      <Icon name="warning" size={13} />
                      {t('surveyInsights.manualRun.previewLowSample', { count: preview.sample_size })}
                    </div>
                  )}
                </dl>
              ) : (
                <div className="text-sm text-muted-foreground">
                  {t('surveyInsights.manualRun.previewUnavailable')}
                </div>
              )}
            </div>

            {/* Label */}
            <div>
              <Label htmlFor="mr-label" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {t('surveyInsights.manualRun.labelLabel')}
              </Label>
              <Input
                id="mr-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder={t('surveyInsights.manualRun.labelPlaceholder')}
                className="mt-2"
                maxLength={120}
              />
            </div>

            {/* Error banner */}
            {phase === 'error' && errorMessage && (
              <div
                role="alert"
                className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-800"
              >
                <div className="font-semibold">{errorMessage}</div>
                {errorCode === 'INSUFFICIENT_CREDITS' && (
                  <div className="text-xs mt-1 text-rose-700">
                    {t('surveyInsights.manualRun.errorCreditsCta')}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Running / done progress */}
        {(phase === 'running' || phase === 'done') && (
          <div className="px-7 pb-4 flex flex-col items-center text-center gap-3 py-6">
            {phase === 'running' ? (
              <>
                <Icon name="hourglass_top" size={32} className="text-primary" style={{ animation: 'spin 1.4s linear infinite' }} />
                <div className="font-bold">{t('surveyInsights.manualRun.progressTitle')}</div>
                <p className="text-sm text-muted-foreground max-w-sm">
                  {t('surveyInsights.manualRun.progressBody')}
                </p>
              </>
            ) : (
              <>
                <Icon name="check_circle" size={32} fill={1} className="text-emerald-600" />
                <div className="font-bold">{t('surveyInsights.manualRun.progressDone')}</div>
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {phase === 'done' ? (
            <>
              <Button variant="outline" onClick={onClose}>
                {t('surveyInsights.manualRun.cancel')}
              </Button>
              {onViewTrail && (
                <Button variant="outline" onClick={() => { onViewTrail(); onClose(); }}>
                  {t('surveyInsights.manualRun.viewTrail')}
                </Button>
              )}
              <Button onClick={() => { onViewReport?.(reportId); onClose(); }}>
                {t('surveyInsights.manualRun.viewReport')}
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={onClose} disabled={phase === 'running'}>
                {t('surveyInsights.manualRun.cancel')}
              </Button>
              <Button onClick={handleConfirm} disabled={confirmDisabled}>
                {phase === 'running'
                  ? t('surveyInsights.manualRun.generating')
                  : confirmLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
