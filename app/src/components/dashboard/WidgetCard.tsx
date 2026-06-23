import type { ReactNode, DragEvent } from 'react';
import { motion } from 'framer-motion';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import type { WidgetColSpan } from '../../types/dashboard';

interface WidgetCardProps {
  id: string;
  title: string;
  icon: string;
  iconColor: string;
  colSpan: WidgetColSpan;
  loading?: boolean;
  onRemove: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOver: (id: string) => void;
  onDrop: (id: string) => void;
  isDraggingOver?: boolean;
  children: ReactNode;
}

export const widgetRise = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.52, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } },
};

export function WidgetCard({
  id, title, icon, iconColor, colSpan, loading,
  onRemove, onDragStart, onDragOver, onDrop, isDraggingOver, children,
}: WidgetCardProps) {
  const { t } = useTranslation();

  const handleDragOver = (e: DragEvent) => { e.preventDefault(); onDragOver(id); };
  const handleDrop = (e: DragEvent) => { e.preventDefault(); onDrop(id); };

  return (
    <motion.div
      variants={widgetRise}
      style={{ gridColumn: `span ${colSpan} / span ${colSpan}` }}
    >
      <div
        className={`h-full rounded-2xl overflow-hidden group relative transition-all duration-300 hover:-translate-y-0.5 ${isDraggingOver ? 'ring-2 ring-[var(--color-primary)]/40 scale-[1.01]' : ''}`}
        style={{
          background: 'var(--color-surface-raised, #fff)',
          boxShadow: isDraggingOver
            ? 'var(--shadow-card-hover, 0 12px 40px rgba(0,0,0,0.14))'
            : 'var(--shadow-card, 0 2px 12px rgba(0,0,0,0.07))',
          border: '1px solid rgba(0,0,0,0.06)',
          transition: 'box-shadow 0.3s ease, transform 0.3s ease',
        }}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        {/* Thicker gradient accent bar */}
        <div
          className="h-1.5 w-full flex-shrink-0"
          style={{ background: `linear-gradient(90deg, ${iconColor}, ${iconColor}55)` }}
        />

        {/* Header — drag handle */}
        <div
          className="flex items-center gap-2.5 px-4 py-3 cursor-grab active:cursor-grabbing select-none"
          draggable
          onDragStart={() => onDragStart(id)}
        >
          <span
            className="rounded-lg p-1.5 flex items-center justify-center flex-shrink-0"
            style={{ background: `${iconColor}18` }}
          >
            <Icon name={icon} size={15} style={{ color: iconColor }} />
          </span>
          <span className="text-[11px] font-bold text-on-surface-variant uppercase tracking-[0.1em] truncate flex-1 min-w-0">
            {title}
          </span>
          <button
            onClick={() => onRemove(id)}
            className="opacity-0 group-hover:opacity-100 transition-all duration-200 rounded-lg p-1 hover:bg-destructive/10 text-on-surface-variant/50 hover:text-destructive flex-shrink-0"
            aria-label={t('dashboard.widget.remove')}
          >
            <Icon name="close" size={13} />
          </button>
        </div>

        {/* Content */}
        <div className="px-4 pb-5 pt-0.5">
          {loading ? <div className="skeleton h-20 rounded-xl" /> : children}
        </div>
      </div>
    </motion.div>
  );
}
