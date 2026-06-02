import { useTranslation } from '../../lib/i18n';
import { useOrgOverview } from '../../hooks/useExperience';

export function OrgTrendsPage() {
  const { t } = useTranslation();
  const { data, loading } = useOrgOverview();

  if (loading) return <div className="p-6 animate-pulse">{t('common.loading')}</div>;

  const d = data as any;

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <h1 className="text-2xl font-semibold">{t('trends.org.title')}</h1>
      {d && (
        <div className="glass-card rounded-xl p-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          {d.avg_nps != null && (
            <div><div className="text-2xl font-bold">{d.avg_nps}</div><div className="text-xs opacity-60">Portfolio NPS</div></div>
          )}
          {d.total_responses != null && (
            <div><div className="text-2xl font-bold">{d.total_responses}</div><div className="text-xs opacity-60">Total Responses</div></div>
          )}
          {d.active_surveys != null && (
            <div><div className="text-2xl font-bold">{d.active_surveys}</div><div className="text-xs opacity-60">Active Surveys</div></div>
          )}
          {d.total_surveys != null && (
            <div><div className="text-2xl font-bold">{d.total_surveys}</div><div className="text-xs opacity-60">Total Surveys</div></div>
          )}
        </div>
      )}
    </div>
  );
}
