import { Icon } from '../../Icon';
import { useTranslation } from '../../../lib/i18n';
import type { DashboardSummary } from '../../../lib/api';

type KpiMetric = 'nps' | 'csat' | 'responses' | 'active';

interface KpiWidgetProps {
  metric: KpiMetric;
  summary: DashboardSummary | null;
}

/**
 * A single KPI tile pulling its value + delta out of the dashboard summary.
 * v1: value + delta only. TODO: add a 90-day sparkline (AreaChart) when metric
 * history is threaded through.
 */
export function KpiWidget({ metric, summary }: KpiWidgetProps) {
  const { t } = useTranslation();

  if (!summary) {
    return <div className="skeleton h-16 rounded-xl" />;
  }

  const k = summary.kpis;
  let value: number | null;
  let delta: number | null = null;
  let label: string;
  let decimals = 0;
  let integer = false;

  switch (metric) {
    case 'nps':
      value = k.nps; delta = k.npsDelta; label = t('dashboard.kpiNps'); break;
    case 'csat':
      value = k.csat; delta = k.csatDelta; label = t('dashboard.kpiCsat'); decimals = 1; break;
    case 'responses':
      value = k.responses; delta = k.responsesDelta; label = t('dashboard.kpiResponses'); integer = true; break;
    case 'active':
    default:
      value = k.activeSurveys; label = t('dashboard.kpiActive'); integer = true; break;
  }

  const fmt = (n: number) => (integer ? Math.round(n).toLocaleString() : n.toFixed(decimals));
  const up = (delta ?? 0) > 0;
  const down = (delta ?? 0) < 0;

  return (
    <div>
      <p className="text-xs text-on-surface-variant uppercase tracking-wide">{label}</p>
      <p className="text-4xl font-black text-on-surface mt-1 leading-none">{value == null ? '—' : fmt(value)}</p>
      {delta != null && delta !== 0 && (
        <p className={`text-xs mt-1.5 flex items-center gap-0.5 ${up ? 'text-success' : down ? 'text-destructive' : 'text-on-surface-variant'}`}>
          <Icon name={up ? 'trending_up' : 'trending_down'} size={13} />
          {up ? '+' : ''}{integer ? Math.round(delta).toLocaleString() : delta.toFixed(decimals)}
        </p>
      )}
    </div>
  );
}
