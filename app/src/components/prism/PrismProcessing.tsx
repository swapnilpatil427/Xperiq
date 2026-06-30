import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Icon } from '../Icon';
import { LiveDot } from '../../pages/insights/shared';
import { useTranslation } from '../../lib/i18n';
import type { PrismJob, PrismStage } from '../../types/prism';

// Stages handled by ImportProgress (load/reconcile). PrismProcessing covers the
// other background stages: connect/discover/extract/profile/transform/enrich/publish.
type ProcessingStage = Exclude<PrismStage, 'load' | 'reconcile' | 'map' | 'dryrun'>;

interface PrismProcessingProps {
  job: PrismJob;
  label: string;
  prefersReducedMotion: boolean;
  onRunInBackground: () => void;
  onPause?: () => void;
  onCancel?: () => void;
}

/**
 * Generic "the server is working on a background stage" panel. Used for every
 * automatic stage that is not a live import (which uses ImportProgress). It is
 * NEVER blank: it always shows a human stage label, a hint, a progress count
 * when available, and the safe-to-leave reassurance.
 */
export function PrismProcessing({
  job, label, prefersReducedMotion, onRunInBackground, onPause, onCancel,
}: PrismProcessingProps) {
  const { t } = useTranslation();

  const stage = job.stage as ProcessingStage;
  const loaded = job.counts.loaded ?? job.counts.transformed ?? 0;
  const total = job.counts.extracted ?? job.counts.discovered ?? 0;
  const hasCount = total > 0;

  // Human headline — prefer a count-aware label where it reads naturally.
  const headline = hasCount && (stage === 'extract' || stage === 'transform')
    ? t('prism.processing.headline.loadCount', { loaded: loaded.toLocaleString(), total: total.toLocaleString() })
    : t(`prism.processing.headline.${stage}`);
  const hint = t(`prism.processing.hint.${stage}`);

  return (
    <Card className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-extrabold font-headline text-on-surface">
          {t('prism.progress.title', { label })}
        </h3>
        <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onRunInBackground}>
          <Icon name="open_in_new" size={14} />{t('prism.progress.runInBackground')}
        </Button>
      </div>

      <div
        className="flex items-start gap-3"
        aria-live="polite"
        aria-busy="true"
      >
        {prefersReducedMotion ? (
          <Icon name="sync" size={18} className="text-primary shrink-0 mt-0.5" aria-label={t('prism.processing.ariaBusy')} />
        ) : (
          <span className="shrink-0 mt-1" aria-label={t('prism.processing.ariaBusy')} role="status">
            <LiveDot color="var(--color-primary)" size={10} />
          </span>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-on-surface">{headline}</p>
          <p className="text-sm text-on-surface-variant mt-0.5">{hint}</p>
          {hasCount && (
            <p className="text-xs tabular-nums text-on-surface-variant mt-1">
              {t('prism.processing.countHint', { loaded: loaded.toLocaleString(), total: total.toLocaleString() })}
            </p>
          )}
        </div>
      </div>

      <p className="text-sm text-on-surface-variant">{t('prism.processing.safeToLeave')}</p>

      {(onPause || onCancel) && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {onPause && (
            <Button variant="outline" size="sm" className="rounded-xl gap-1.5" onClick={onPause}>
              <Icon name="pause" size={14} />{t('prism.progress.pause')}
            </Button>
          )}
          {onCancel && (
            <Button variant="ghost" size="sm" className="rounded-xl gap-1.5 text-destructive" onClick={onCancel}>
              <Icon name="cancel" size={14} />{t('prism.progress.cancel')}
            </Button>
          )}
        </div>
      )}
    </Card>
  );
}
