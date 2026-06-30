import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import { cn } from '@/lib/utils';
import type { PrismJob, PrismStage } from '../../types/prism';

// The stage chips shown during load — order matters (left → right).
const STAGE_CHIPS: PrismStage[] = ['connect', 'extract', 'map', 'load', 'reconcile'];
const STAGE_ORDER: PrismStage[] = [
  'connect', 'discover', 'extract', 'profile', 'map', 'transform', 'dryrun', 'load', 'reconcile', 'enrich', 'publish',
];

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.floor(diff / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

interface ImportProgressProps {
  job: PrismJob;
  label: string;
  prefersReducedMotion: boolean;
  onRunInBackground: () => void;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
  onViewErrors?: () => void;
}

export function ImportProgress({
  job, label, prefersReducedMotion, onRunInBackground, onPause, onResume, onCancel, onViewErrors,
}: ImportProgressProps) {
  const { t } = useTranslation();
  const loaded = job.counts.loaded ?? 0;
  const total = (job.counts.extracted ?? job.counts.discovered ?? 0) || loaded;
  const failed = job.counts.failed ?? 0;
  const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 0;
  const currentStageIdx = STAGE_ORDER.indexOf(job.stage);
  const isPaused = job.status === 'paused';

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-extrabold font-headline text-on-surface">{t('prism.progress.title', { label })}</h3>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onRunInBackground}>
          <Icon name="open_in_new" size={14} />{t('prism.progress.runInBackground')}
        </Button>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-sm font-semibold text-on-surface flex items-center gap-1.5">
            {!prefersReducedMotion && (
              <span className="w-2 h-2 rounded-full bg-primary" style={{ animation: 'pulse-glow 2.5s ease-in-out infinite' }} aria-hidden />
            )}
            {t('prism.progress.stage', { stage: t(`prism.stage.${job.stage}`) })}
          </span>
          <span className="text-sm tabular-nums text-on-surface-variant">
            {t('prism.progress.progressLabel', { loaded: loaded.toLocaleString(), total: total.toLocaleString(), pct })}
          </span>
        </div>
        <Progress value={pct} aria-label={t('prism.progress.stage', { stage: t(`prism.stage.${job.stage}`) })} />
      </div>

      {/* Stage chips fill with the brand spectrum as the job advances */}
      <ol className="flex flex-wrap items-center gap-2" aria-label={t('prism.stepper.ariaLabel')}>
        {STAGE_CHIPS.map((s) => {
          const idx = STAGE_ORDER.indexOf(s);
          const isDone = currentStageIdx > idx;
          const isActive = job.stage === s;
          return (
            <li
              key={s}
              className={cn(
                'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
                isDone && 'text-white',
                isActive && 'text-white',
                !isDone && !isActive && 'bg-surface-container text-on-surface-variant',
              )}
              style={isDone || isActive ? { background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' } : undefined}
              aria-current={isActive ? 'step' : undefined}
            >
              <Icon name={isDone ? 'check' : isActive ? 'sync' : 'radio_button_unchecked'} size={12} fill={isDone ? 1 : 0} />
              {t(`prism.progress.stageChip.${s}`)}
            </li>
          );
        })}
      </ol>

      <p className="text-xs text-on-surface-variant flex flex-wrap items-center gap-x-3 gap-y-1">
        <span>{failed > 0 ? t('prism.progress.errorsSome', { count: failed }) : t('prism.progress.errorsNone')}</span>
        <span>· {t('prism.progress.startedAgo', { time: relativeTime(job.created_at) })}</span>
      </p>

      <p className="text-sm text-on-surface-variant">{t('prism.progress.safeToLeave')}</p>

      {/* Partial-failure non-blocking banner */}
      {job.status === 'partial' && failed > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-2.5 bg-warning/10">
          <span className="text-sm font-medium text-warning">
            {t('prism.progress.partialBanner', { imported: loaded.toLocaleString(), failed: failed.toLocaleString() })}
          </span>
          {onViewErrors && (
            <button type="button" className="text-xs font-semibold text-primary hover:underline" onClick={onViewErrors}>
              {t('prism.progress.viewErrors')}
            </button>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1">
        {isPaused ? (
          <Button variant="success" size="sm" className="rounded-xl gap-1.5" onClick={onResume}>
            <Icon name="play_arrow" size={14} />{t('prism.progress.resume')}
          </Button>
        ) : (
          <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onPause}>
            <Icon name="pause" size={14} />{t('prism.progress.pause')}
          </Button>
        )}
        <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 text-destructive" onClick={onCancel}>
          <Icon name="cancel" size={14} />{t('prism.progress.cancel')}
        </Button>
      </div>
    </Card>
  );
}
