import { useTranslation } from '../../lib/i18n';

type TrendPersistence = 'first_occurrence' | 'second_occurrence' | 'confirmed' | 'reversal' | 'stable';
type TrendDirection = 'up' | 'down' | 'stable';

interface TrendBadgeProps {
  direction: TrendDirection;
  persistence: TrendPersistence;
}

const DIRECTION_ARROWS: Record<TrendDirection, string> = { up: '↑', down: '↓', stable: '→' };

const PERSISTENCE_COLORS: Record<TrendPersistence, string> = {
  confirmed:         'bg-green-100 text-green-800',
  second_occurrence: 'bg-blue-100 text-blue-700',
  first_occurrence:  'bg-gray-100 text-gray-600',
  reversal:          'bg-amber-100 text-amber-800',
  stable:            'bg-gray-100 text-gray-500',
};

export function TrendBadge({ direction, persistence }: TrendBadgeProps) {
  const { t } = useTranslation();
  const arrow = DIRECTION_ARROWS[direction];
  const colorClass = PERSISTENCE_COLORS[persistence] || PERSISTENCE_COLORS.stable;
  const label = t(`trends.persistence.${persistence}`);

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${colorClass}`}>
      {arrow} {label}
    </span>
  );
}
