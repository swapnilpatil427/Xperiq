import { Icon } from '../../Icon';
import { useTranslation } from '../../../lib/i18n';
import type { DashboardSummary } from '../../../lib/api';

type KpiMetric = 'nps' | 'csat' | 'responses' | 'active';

interface KpiWidgetProps {
  metric: KpiMetric;
  summary: DashboardSummary | null;
}

const METRIC_COLORS: Record<KpiMetric, string> = {
  nps:       'var(--color-primary)',
  csat:      '#10b981',
  responses: '#f59e0b',
  active:    'var(--color-tertiary)',
};

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
  const color = METRIC_COLORS[metric];

  return (
    <div className="pb-1">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-variant/70 mb-1.5">{label}</p>
      <p
        className="text-5xl font-black leading-none tabular-nums"
        style={{
          background: `linear-gradient(135deg, ${color} 0%, ${color}bb 100%)`,
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {value == null ? '—' : fmt(value)}
      </p>
      {delta != null && delta !== 0 && (
        <div
          className={`inline-flex items-center gap-1 mt-2.5 px-2 py-0.5 rounded-full text-[11px] font-semibold ${
            up ? 'text-emerald-700' : 'text-red-600'
          }`}
          style={{
            background: up ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
          }}
        >
          <Icon name={up ? 'trending_up' : 'trending_down'} size={12} />
          {up ? '+' : ''}{integer ? Math.round(delta).toLocaleString() : delta.toFixed(decimals)}
        </div>
      )}
    </div>
  );
}
