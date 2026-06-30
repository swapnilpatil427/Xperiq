import { Icon } from '../Icon';
import { cn } from '@/lib/utils';

// Confidence buckets mirror the insight-layer thresholds (≥80 reliable /
// 60–79 review / <60 low). Status is never color-only — each carries an icon.
export type ConfidenceLevel = 'high' | 'review' | 'low';

export function confidenceLevel(confidence: number): ConfidenceLevel {
  const pct = confidence <= 1 ? confidence * 100 : confidence;
  if (pct >= 80) return 'high';
  if (pct >= 60) return 'review';
  return 'low';
}

const META: Record<ConfidenceLevel, { icon: string; className: string }> = {
  high:   { icon: 'check_circle', className: 'bg-success/10 text-success' },
  review: { icon: 'adjust',       className: 'bg-warning/10 text-warning' },
  low:    { icon: 'radio_button_unchecked', className: 'bg-muted text-muted-foreground' },
};

interface ConfidenceChipProps {
  confidence: number;            // 0..1 or 0..100
  className?: string;
}

export function ConfidenceChip({ confidence, className }: ConfidenceChipProps) {
  const level = confidenceLevel(confidence);
  const pct = Math.round(confidence <= 1 ? confidence * 100 : confidence);
  const meta = META[level];
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums', meta.className, className)}
      title={`${pct}%`}
    >
      <Icon name={meta.icon} size={12} fill={level === 'high' ? 1 : 0} />
      {pct}%
    </span>
  );
}
