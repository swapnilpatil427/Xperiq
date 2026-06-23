import { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceDot } from 'recharts';
import { useApi } from '../../../hooks/useApi';
import { useTranslation } from '../../../lib/i18n';
import { DATE_RANGE_DAYS } from '../../../types/dashboard';
import type { DashboardFilters } from '../../../types/dashboard';

interface NpsTrendWidgetProps {
  filters: DashboardFilters;
}

interface TrendPoint { day: string; nps: number | null; anomaly: boolean }

/**
 * NPS trend chart. Fetches its own history based on the active filters:
 *  - a specific survey → survey metric history (uses `nps`)
 *  - org-level         → org metric history (uses `avg_nps`)
 * Chart styling mirrors the original DashboardPage NPS trend (gradient area,
 * anomaly dot markers).
 */
export function NpsTrendWidget({ filters }: NpsTrendWidgetProps) {
  const { t } = useTranslation();
  const api = useApi();
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const days = DATE_RANGE_DAYS[filters.dateRange];
    setLoading(true);
    const load = filters.surveyId
      ? api.getSurveyMetricHistory(filters.surveyId, days).then((r) =>
          (r.history || []).map((h) => ({
            day: (h.captured_at || '').slice(0, 10),
            nps: h.nps,
            anomaly: !!h.anomaly_flag,
          })),
        )
      : api.getOrgMetricHistory(days).then((r) =>
          (r.history || []).map((h) => ({
            day: (h.captured_at || '').slice(0, 10),
            nps: h.avg_nps,
            anomaly: false,
          })),
        );
    load
      .then((points) => setData(points))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [api, filters.surveyId, filters.dateRange]);

  if (loading) {
    return <div className="skeleton h-[240px] rounded-xl" />;
  }
  if (data.length === 0) {
    return <p className="text-sm text-on-surface-variant py-12 text-center">{t('dashboard.noHistory')}</p>;
  }

  return (
    <div style={{ width: '100%', height: 240 }}>
      <ResponsiveContainer>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="widgetNpsFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.4} />
              <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
          <XAxis dataKey="day" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} domain={[-100, 100]} />
          <Tooltip />
          <Area type="monotone" dataKey="nps" stroke="var(--color-primary)" fill="url(#widgetNpsFill)" strokeWidth={2} connectNulls />
          {data.map((pt, i) =>
            pt.anomaly && pt.nps != null ? (
              <ReferenceDot key={i} x={pt.day} y={pt.nps} r={5}
                fill="var(--color-warning, #f59e0b)" stroke="#fff" strokeWidth={1.5} />
            ) : null,
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
