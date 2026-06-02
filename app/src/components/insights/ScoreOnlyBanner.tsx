import { useState } from 'react';
import { useTranslation } from '../../lib/i18n';

interface ScoreOnlyBannerProps {
  surveyId: string;
}

export function ScoreOnlyBanner({ surveyId }: ScoreOnlyBannerProps) {
  const { t } = useTranslation();
  const key = `score_only_dismissed_${surveyId}`;
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(key) === '1');

  if (dismissed) return null;

  const handleDismiss = () => {
    localStorage.setItem(key, '1');
    setDismissed(true);
  };

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between">
      <span className="text-sm text-blue-800">{t('insights.state.scoreOnlySurvey.message')}</span>
      <button onClick={handleDismiss} className="text-blue-600 text-lg leading-none ml-4">×</button>
    </div>
  );
}
