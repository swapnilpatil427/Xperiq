import { cn } from '@/lib/utils';
import { Icon } from './Icon';
import type { SurveyTag } from '../lib/api';

interface TagBadgeProps {
  tag: SurveyTag;
  removable?: boolean;
  onRemove?: (tagId: string) => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function TagBadge({ tag, removable = false, onRemove, size = 'md', className }: TagBadgeProps) {
  const sizeClass = size === 'sm'
    ? 'text-xs px-2 py-0.5 gap-1'
    : 'text-sm px-2.5 py-1 gap-1.5';

  const dotSize = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium whitespace-nowrap',
        sizeClass,
        className,
      )}
      style={{
        background: `${tag.color}1a`,
        color: tag.color,
        border: `1px solid ${tag.color}40`,
      }}
    >
      <span
        className={cn('rounded-full shrink-0', dotSize)}
        style={{ background: tag.color }}
      />
      <span className="truncate max-w-[160px]">{tag.name}</span>
      {removable && onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRemove(tag.id); }}
          className="shrink-0 ml-0.5 rounded-full opacity-60 hover:opacity-100 transition-opacity leading-none"
          aria-label={`Remove ${tag.name}`}
        >
          <Icon name="close" size={size === 'sm' ? 10 : 12} />
        </button>
      )}
    </span>
  );
}
