import { useTranslation } from '../../../lib/i18n';
import { Badge } from '@/components/ui/badge';
import type { DashboardOperations } from '../../../lib/api';

interface SurveyHealthWidgetProps {
  operations: DashboardOperations | null;
}

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'neutral' | 'default'> = {
  active: 'success',
  paused: 'warning',
  closed: 'neutral',
  draft: 'default',
};

/**
 * Survey health matrix — one row per survey with status, response count and a
 * freshness indicator. Extracted from the original DashboardPage OperationsLayout.
 */
export function SurveyHealthWidget({ operations }: SurveyHealthWidgetProps) {
  const { t } = useTranslation();

  if (!operations) {
    return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-8 rounded-lg" />)}</div>;
  }
  if (operations.surveys.length === 0) {
    return <p className="text-sm text-on-surface-variant py-8 text-center">{t('dashboard.widget.noSurveys')}</p>;
  }

  return (
    <div className="divide-y divide-[var(--color-outline)]/15">
      {operations.surveys.map((s) => (
        <div key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
          <span
            className={`w-2 h-2 rounded-full flex-shrink-0 ${s.freshness === 'fresh' ? 'bg-success' : s.freshness === 'stale' ? 'bg-warning' : 'bg-muted-foreground'}`}
          />
          <span className="flex-1 min-w-0 truncate text-on-surface">{s.title}</span>
          <Badge variant={STATUS_VARIANT[s.status] || 'default'} className="capitalize text-[10px] flex-shrink-0">{s.status}</Badge>
          <span className="text-on-surface-variant w-16 text-right tabular-nums">{s.responseCount}</span>
          <span className="w-12 text-right text-on-surface tabular-nums">{s.nps ?? '—'}</span>
        </div>
      ))}
    </div>
  );
}
