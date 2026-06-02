import { useTranslation } from '../../lib/i18n';

interface SurveyStatusBannerProps {
  status: 'paused' | 'closed';
  responseCount: number;
  onResume?: () => void;
}

export function SurveyStatusBanner({ status, responseCount, onResume }: SurveyStatusBannerProps) {
  const { t } = useTranslation();
  const isPaused = status === 'paused';

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${
      isPaused ? 'bg-amber-50 border-amber-300' : 'bg-gray-50 border-gray-300'
    }`}>
      <div>
        <span className={`text-sm font-medium ${isPaused ? 'text-amber-800' : 'text-gray-700'}`}>
          {t(`insights.state.surveySuspended.${status}`)}
        </span>
        <span className="text-sm opacity-60 ml-2">
          {t('insights.state.surveySuspended.responseCount', { n: responseCount })}
        </span>
      </div>
      {isPaused && onResume && (
        <button onClick={onResume} className="text-sm font-medium text-amber-700 underline">
          {t('insights.state.surveySuspended.resume')}
        </button>
      )}
    </div>
  );
}
