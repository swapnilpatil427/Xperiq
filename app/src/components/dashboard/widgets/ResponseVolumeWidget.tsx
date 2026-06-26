import { useState, useEffect } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useApi } from '../../../hooks/useApi';
import { useTranslation } from '../../../lib/i18n';
import type { DashboardFilters } from '../../../types/dashboard';

interface ResponseVolumeWidgetProps {
  filters: DashboardFilters;
}

interface DayPoint { date: string; count: number }

/**
 * Daily response volume bar chart. Fetches org analytics (responses_by_day).
 * When a specific survey is selected we fetch that survey's analytics instead.
 */
export function ResponseVolumeWidget({ filters }: ResponseVolumeWidgetProps) {
  const { t } = useTranslation();
  const api = useApi();
  const [data, setData] = useState<DayPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    const load = filters.surveyId
      ? api.getSurveyAnalytics(filters.surveyId).then((r) =>
          (r.responses_by_day || []).map((d) => ({ date: d.day, count: Number(d.count) })),
        )
      : api.getOrgAnalytics().then((r) =>
          (r.responses_by_day || []).map((d) => ({ date: d.day, count: Number(d.count) })),
        );
    load
      .then(setData)
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [api, filters.surveyId]);

  if (loading) {
    return <div className="skeleton h-[200px] rounded-xl" />;
  }
  if (data.length === 0) {
    return <p className="text-sm text-on-surface-variant py-10 text-center">{t('dashboard.widget.noData')}</p>;
  }

  return (
    <div style={{ width: '100%', height: 200 }}>
      <ResponsiveContainer>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: 'rgba(255,255,255,0.04)' }}
            contentStyle={{
              background: 'var(--color-surface-raised)',
              border: '1px solid var(--color-outline)',
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Bar dataKey="count" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
