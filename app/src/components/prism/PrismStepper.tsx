import { Icon } from '../Icon';
import { cn } from '@/lib/utils';
import { useTranslation } from '../../lib/i18n';
import type { PrismWizardStep } from '../../types/prism';

const STEPS: PrismWizardStep[] = ['connect', 'select', 'map', 'review', 'import', 'done'];

interface PrismStepperProps {
  current: PrismWizardStep;
}

/** ARIA stepper — active fill uses the brand spectrum; state is never color-only. */
export function PrismStepper({ current }: PrismStepperProps) {
  const { t } = useTranslation();
  const currentIdx = STEPS.indexOf(current);

  return (
    <nav aria-label={t('prism.stepper.ariaLabel')} className="mb-6">
      <ol className="flex items-center gap-1 overflow-x-auto">
        {STEPS.map((step, i) => {
          const isDone = i < currentIdx;
          const isActive = i === currentIdx;
          const statusLabel = isDone
            ? t('prism.stepper.done_status')
            : isActive ? t('prism.stepper.active_status') : t('prism.stepper.pending_status');
          return (
            <li key={step} className="flex items-center shrink-0" aria-current={isActive ? 'step' : undefined}>
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    'flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0',
                    (isDone || isActive) ? 'text-white' : 'bg-surface-container text-on-surface-variant',
                  )}
                  style={isDone || isActive ? { background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))' } : undefined}
                >
                  {isDone ? <Icon name="check" size={14} fill={1} /> : i + 1}
                </span>
                <span className={cn('text-sm font-semibold', isActive ? 'text-on-surface' : 'text-on-surface-variant')}>
                  {t(`prism.stepper.${step}`)}
                  <span className="sr-only"> — {statusLabel}</span>
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <span className={cn('mx-2 w-6 h-px', isDone ? 'bg-primary' : 'bg-border')} aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
