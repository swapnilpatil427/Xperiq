import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from '../../lib/i18n';
import { useSurveyReport } from '../../hooks/useExperience';

export function SurveyReportPage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const { t } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | undefined>();

  const { data: listData, loading: listLoading } = useSurveyReport(surveyId!);
  const { data: reportData, loading: reportLoading } = useSurveyReport(surveyId!, selectedId);

  const checkpoints: any[] = (listData as any)?.checkpoints || [];

  return (
    <div className="max-w-5xl mx-auto w-full">
      <h1 className="text-2xl font-semibold mb-2">{t('trends.checkpoint.title')}</h1>

      {listLoading && <div className="animate-pulse">{t('common.loading')}</div>}

      {checkpoints.length > 0 && (
        <div className="mb-6">
          <label className="text-sm font-medium opacity-70 mr-2">{t('trends.checkpoint.select')}</label>
          <select
            className="border rounded px-2 py-1 text-sm"
            value={selectedId || ''}
            onChange={e => setSelectedId(e.target.value || undefined)}
          >
            <option value="">{t('trends.checkpoint.latest')}</option>
            {checkpoints.map((cp: any) => (
              <option key={cp.id} value={cp.id}>
                #{cp.checkpoint_number} — {cp.response_count_at_checkpoint} {t('common.responses')}
                {cp.nps_at_checkpoint != null ? ` · NPS ${cp.nps_at_checkpoint}` : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      {reportLoading && <div className="animate-pulse">{t('common.loading')}</div>}

      {reportData && !reportLoading && (
        <div className="glass-card rounded-xl p-6">
          <pre className="text-xs overflow-auto max-h-96">{JSON.stringify(reportData, null, 2)}</pre>
        </div>
      )}

      {!listLoading && checkpoints.length === 0 && (
        <div className="text-center py-16 opacity-50">{t('trends.checkpoint.noCheckpoints')}</div>
      )}
    </div>
  );
}
