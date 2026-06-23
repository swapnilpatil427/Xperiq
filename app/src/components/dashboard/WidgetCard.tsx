import type { ReactNode, DragEvent } from 'react';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import type { WidgetColSpan } from '../../types/dashboard';

interface WidgetCardProps {
  id: string;
  title: string;
  icon: string;          // Material Symbol name
  iconColor: string;     // hex color for icon strip + dot
  colSpan: WidgetColSpan;
  loading?: boolean;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  isDraggingOver?: boolean;
  children: ReactNode;
}

/**
 * Glass-card wrapper for a dashboard widget. Owns the colored accent bar,
 * header (drag handle + title + remove), and HTML5 drag/drop wiring. Span is
 * applied via inline style because Tailwind purges dynamic col-span classes.
 */
export function WidgetCard({
  id, title, icon, iconColor, colSpan, loading,
  onRemove, onDragStart, onDragOver, onDrop, isDraggingOver, children,
}: WidgetCardProps) {
  const { t } = useTranslation();

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    onDragOver(id);
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    onDrop(id);
  };

  return (
    <div style={{ gridColumn: `span ${colSpan} / span ${colSpan}` }}>
      <div
        className={`rounded-2xl border border-[var(--color-outline)]/20 bg-[var(--color-surface-raised)] overflow-hidden group relative transition-shadow ${isDraggingOver ? 'ring-2 ring-[var(--color-primary)]/60' : ''}`}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Colored top accent bar */}
        <div className="h-0.5 w-full" style={{ background: iconColor }} />

        {/* Header — also the drag handle */}
        <div
          className="flex items-center gap-2 px-4 py-3 cursor-grab active:cursor-grabbing"
          draggable
          onDragStart={() => onDragStart(id)}
        >
          <span className="rounded-md p-1 flex items-center justify-center" style={{ background: `${iconColor}26` }}>
            <Icon name={icon} size={16} style={{ color: iconColor }} />
          </span>
          <span className="text-sm font-semibold text-[var(--color-on-surface)] truncate flex-1 min-w-0">{title}</span>
          <button
            onClick={() => onRemove(id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-on-surface-variant hover:text-destructive p-1 rounded-md flex-shrink-0"
            aria-label={t('dashboard.widget.remove')}
            title={t('dashboard.widget.remove')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 pt-0">
          {loading ? <div className="skeleton h-24 rounded-xl" /> : children}
        </div>
      </div>
    </div>
  );
}
