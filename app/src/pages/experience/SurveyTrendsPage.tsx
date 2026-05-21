import { useParams } from 'react-router-dom';
import { useTranslation } from '../../lib/i18n';
import { useSurveyTrends } from '../../hooks/useExperience';

export function SurveyTrendsPage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const { t } = useTranslation();
  const { data, loading } = useSurveyTrends(surveyId!);

  if (loading) return <div className="p-6 animate-pulse">{t('common.loading')}</div>;

  const snapshots: any[] = (data as any)?.history || [];

  return (
    <div className="max-w-5xl mx-auto w-full space-y-6">
      <h1 className="text-2xl font-semibold">{t('trends.title')}</h1>

      <div className="glass-card rounded-xl p-6">
        <h2 className="text-sm font-medium opacity-70 mb-4">{t('trends.npsHistory')}</h2>
        {snapshots.length === 0 ? (
          <div className="text-center py-8 opacity-50">{t('trends.noData')}</div>
        ) : (
          <div className="space-y-2">
            {snapshots.slice(-10).map((s: any, i: number) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="opacity-60">{new Date(s.captured_at).toLocaleDateString()}</span>
                {s.nps != null && <span>NPS: {s.nps}</span>}
                {s.csat != null && <span>CSAT: {s.csat}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
