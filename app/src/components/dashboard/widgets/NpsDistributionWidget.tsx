import { Link } from 'react-router-dom';
import { ResponsiveContainer, RadialBarChart, RadialBar, PolarAngleAxis } from 'recharts';
import { useTranslation } from '../../../lib/i18n';
import { ROUTES } from '../../../constants/routes';
import type { DashboardSummary } from '../../../lib/api';

interface NpsDistributionWidgetProps {
  summary: DashboardSummary | null;
}

/**
 * NPS gauge. DashboardSummary doesn't carry a promoter/passive/detractor
 * breakdown, so v1 shows a colour-coded radial gauge of the headline NPS with
 * a link out to the per-survey distribution.
 */
export function NpsDistributionWidget({ summary }: NpsDistributionWidgetProps) {
  const { t } = useTranslation();

  if (!summary) {
    return <div className="skeleton h-[200px] rounded-xl" />;
  }

  const nps = summary.kpis.nps;
  const value = nps == null ? 0 : nps;
  // Colour by zone: red (<0), amber (0–30), green (>30).
  const color = value < 0 ? '#ef4444' : value < 30 ? '#f59e0b' : '#10b981';
  // Map -100..100 onto a 0..100 gauge fill.
  const gaugeValue = Math.round((value + 100) / 2);

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs text-on-surface-variant uppercase tracking-wide self-start mb-1">
        {t('dashboard.widget.npsComposition')}
      </p>
      <div style={{ width: '100%', height: 160, position: 'relative' }}>
        <ResponsiveContainer>
          <RadialBarChart
            innerRadius="72%"
            outerRadius="100%"
            data={[{ name: 'nps', value: gaugeValue, fill: color }]}
            startAngle={210}
            endAngle={-30}
          >
            <PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} />
            <RadialBar dataKey="value" cornerRadius={8} background={{ fill: 'rgba(255,255,255,0.06)' }} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-4xl font-black text-on-surface leading-none" style={{ color }}>
            {nps == null ? '—' : Math.round(nps)}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-on-surface-variant mt-1">{t('dashboard.kpiNps')}</span>
        </div>
      </div>
      <Link to={ROUTES.EXPERIENCE} className="text-xs text-primary hover:underline mt-1">
        {t('dashboard.widget.viewDistribution')} →
      </Link>
    </div>
  );
}
