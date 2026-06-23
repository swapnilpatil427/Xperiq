import { useState } from 'react';
import { Icon } from '../Icon';
import { useTranslation } from '../../lib/i18n';
import { WidgetCard } from './WidgetCard';
import { WIDGET_REGISTRY } from '../../types/dashboard';
import type { WidgetConfig, DashboardFilters, WidgetType } from '../../types/dashboard';
import type { DashboardSummary, DashboardOperations } from '../../lib/api';
import { KpiWidget } from './widgets/KpiWidget';
import { NpsTrendWidget } from './widgets/NpsTrendWidget';
import { NpsDistributionWidget } from './widgets/NpsDistributionWidget';
import { ResponseVolumeWidget } from './widgets/ResponseVolumeWidget';
import { TopicGridWidget } from './widgets/TopicGridWidget';
import { SurveyHealthWidget } from './widgets/SurveyHealthWidget';
import { CrystalNarrativeWidget } from './widgets/CrystalNarrativeWidget';

interface WidgetGridProps {
  widgets: WidgetConfig[];
  filters: DashboardFilters;
  summary: DashboardSummary | null;
  operations: DashboardOperations | null;
  onRemove: (id: string) => void;
  onReorder: (fromId: string, toId: string) => void;
}

const REGISTRY_BY_TYPE = Object.fromEntries(WIDGET_REGISTRY.map((w) => [w.type, w])) as Record<
  WidgetType,
  (typeof WIDGET_REGISTRY)[number]
>;

function renderWidgetBody(
  w: WidgetConfig,
  filters: DashboardFilters,
  summary: DashboardSummary | null,
  operations: DashboardOperations | null,
) {
  switch (w.type) {
    case 'kpi_nps': return <KpiWidget metric="nps" summary={summary} />;
    case 'kpi_csat': return <KpiWidget metric="csat" summary={summary} />;
    case 'kpi_responses': return <KpiWidget metric="responses" summary={summary} />;
    case 'kpi_active': return <KpiWidget metric="active" summary={summary} />;
    case 'nps_trend': return <NpsTrendWidget filters={filters} />;
    case 'nps_distribution': return <NpsDistributionWidget summary={summary} />;
    case 'response_volume': return <ResponseVolumeWidget filters={filters} />;
    case 'topic_grid': return <TopicGridWidget filters={filters} />;
    case 'survey_health': return <SurveyHealthWidget operations={operations} />;
    case 'crystal_narrative': return <CrystalNarrativeWidget summary={summary} />;
    default: return null;
  }
}

/** 12-column widget grid with HTML5 drag-and-drop reordering. */
export function WidgetGrid({ widgets, filters, summary, operations, onRemove, onReorder }: WidgetGridProps) {
  const { t } = useTranslation();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  if (widgets.length === 0) {
    return (
      <div className="grid grid-cols-12 gap-4 mt-4">
        <div className="col-span-12 rounded-2xl border border-dashed border-[var(--color-outline)]/30 bg-[var(--color-surface-raised)]/50 py-16 flex flex-col items-center justify-center text-center">
          <Icon name="auto_awesome" size={40} className="text-on-surface-variant/40 mb-3" />
          <p className="text-sm text-on-surface-variant max-w-xs">{t('dashboard.widget.empty')}</p>
        </div>
      </div>
    );
  }

  const handleDrop = (toId: string) => {
    if (dragId && dragId !== toId) onReorder(dragId, toId);
    setDragId(null);
    setOverId(null);
  };

  return (
    <div className="grid grid-cols-12 gap-4 mt-4">
      {widgets.map((w) => {
        const reg = REGISTRY_BY_TYPE[w.type];
        return (
          <WidgetCard
            key={w.id}
            id={w.id}
            title={reg?.label ?? w.type}
            icon={reg?.icon ?? 'widgets'}
            iconColor={reg?.color ?? '#6366f1'}
            colSpan={w.colSpan}
            onRemove={onRemove}
            onDragStart={setDragId}
            onDragOver={setOverId}
            onDrop={handleDrop}
            isDraggingOver={overId === w.id && dragId !== null && dragId !== w.id}
          >
            {renderWidgetBody(w, filters, summary, operations)}
          </WidgetCard>
        );
      })}
    </div>
  );
}
