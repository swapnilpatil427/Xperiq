import { useTranslation } from '../../lib/i18n';

type PageState = 'collecting' | 'generating' | 'ready' | 'stale' | 'error';
type SurveyStatus = 'active' | 'paused' | 'closed' | 'draft';

interface InsightStateBannerProps {
  pageState: PageState;
  surveyStatus: SurveyStatus;
  canManualRefresh: boolean;
  manualRefreshLimitReached: boolean;
  onGenerateInsight: () => void;
}

export function InsightStateBanner({
  pageState,
  surveyStatus,
  canManualRefresh,
  manualRefreshLimitReached,
  onGenerateInsight,
}: InsightStateBannerProps) {
  const { t } = useTranslation();

  if (pageState === 'ready' && surveyStatus === 'active') return null;

  const configs: Record<string, { bg: string; text: string; stateKey: string }> = {
    collecting: { bg: 'bg-blue-50 border-blue-200',    text: 'text-blue-800',   stateKey: 'collecting' },
    generating: { bg: 'bg-purple-50 border-purple-200', text: 'text-purple-800', stateKey: 'generating' },
    stale:      { bg: 'bg-amber-50 border-amber-200',  text: 'text-amber-800',  stateKey: 'stale' },
    error:      { bg: 'bg-red-50 border-red-200',      text: 'text-red-800',    stateKey: 'error' },
    ready:      { bg: 'bg-gray-50 border-gray-200',    text: 'text-gray-700',   stateKey: 'ready' },
  };

  const cfg = configs[pageState] || configs.ready;

  return (
    <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${cfg.bg}`}>
      <span className={`text-sm ${cfg.text}`}>
        {t(`insights.state.${cfg.stateKey}`)}
      </span>
      {canManualRefresh && surveyStatus === 'active' && (
        <button
          onClick={onGenerateInsight}
          disabled={manualRefreshLimitReached}
          className="text-sm font-medium underline disabled:opacity-40 disabled:no-underline"
        >
          {manualRefreshLimitReached
            ? t('insights.state.refreshLimitReached')
            : t('insights.state.generateInsight')}
        </button>
      )}
    </div>
  );
}
