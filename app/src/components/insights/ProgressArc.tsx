type DataTier = 'collecting' | 'first_voices' | 'early_signals' | 'growing_picture' | 'full_report';

const TIER_ICONS: Record<DataTier, string> = {
  collecting:      '○',
  first_voices:    '◔',
  early_signals:   '◑',
  growing_picture: '◕',
  full_report:     '●',
};

const TIER_COLORS: Record<DataTier, string> = {
  collecting:      'opacity-30',
  first_voices:    'text-blue-400',
  early_signals:   'text-blue-500',
  growing_picture: 'text-blue-600',
  full_report:     'text-blue-700',
};

interface ProgressArcProps {
  tier: DataTier;
  responseCount?: number;
  size?: 'sm' | 'md' | 'lg';
}

export function ProgressArc({ tier, responseCount, size = 'md' }: ProgressArcProps) {
  const sizeClass = size === 'sm' ? 'text-2xl' : size === 'lg' ? 'text-5xl' : 'text-4xl';
  const icon = TIER_ICONS[tier];
  const colorClass = TIER_COLORS[tier];

  return (
    <div
      className={`${sizeClass} ${colorClass} font-mono leading-none select-none`}
      aria-label={`Data collection: ${tier.replace('_', ' ')}${responseCount != null ? `, ${responseCount} responses` : ''}`}
      role="img"
    >
      {icon}
    </div>
  );
}
