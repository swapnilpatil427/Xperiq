import { useTranslation } from '../../lib/i18n';

interface AnomalyChipProps {
  credibility: 'new_anomaly' | 'ongoing_issue';
  delta?: number | null;
}

export function AnomalyChip({ credibility, delta }: AnomalyChipProps) {
  const { t } = useTranslation();
  const isNew = credibility === 'new_anomaly';
  const label = t(`trends.anomaly.${credibility}`);
  const deltaText = delta != null ? ` (${delta > 0 ? '+' : ''}${delta})` : '';

  return (
    <span
      title={delta != null ? `Delta from prior checkpoint: ${deltaText}` : undefined}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
        isNew ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'
      }`}
    >
      {isNew ? '🔴' : '⚠️'} {label}{deltaText}
    </span>
  );
}
