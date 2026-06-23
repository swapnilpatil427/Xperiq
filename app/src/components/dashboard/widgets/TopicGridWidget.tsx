import { useState, useEffect } from 'react';
import { useApi } from '../../../hooks/useApi';
import { useTranslation } from '../../../lib/i18n';
import type { DashboardFilters } from '../../../types/dashboard';
import type { SurveyTopic } from '../../../types';

interface TopicGridWidgetProps {
  filters: DashboardFilters;
}

const HEALTH_COLOR: Record<string, string> = {
  healthy: '#10b981',
  stable: '#6366f1',
  'at-risk': '#ef4444',
};

/**
 * Top topics by urgency for the selected survey. Topics are survey-scoped, so
 * without a survey filter the widget prompts the user to pick one.
 */
export function TopicGridWidget({ filters }: TopicGridWidgetProps) {
  const { t } = useTranslation();
  const api = useApi();
  const [topics, setTopics] = useState<SurveyTopic[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filters.surveyId) {
      setTopics([]);
      return;
    }
    setLoading(true);
    api
      .listTopics(filters.surveyId, 'all_time', 'urgency')
      .then((r) => setTopics((r.topics || []).slice(0, 8)))
      .catch(() => setTopics([]))
      .finally(() => setLoading(false));
  }, [api, filters.surveyId]);

  if (!filters.surveyId) {
    return <p className="text-sm text-on-surface-variant py-10 text-center">{t('dashboard.widget.topicsPrompt')}</p>;
  }
  if (loading) {
    return <div className="space-y-2">{[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-6 rounded-lg" />)}</div>;
  }
  if (topics.length === 0) {
    return <p className="text-sm text-on-surface-variant py-10 text-center">{t('dashboard.widget.noData')}</p>;
  }

  return (
    <div className="space-y-2.5">
      {topics.map((topic) => {
        const urgency = topic.urgency_score ?? 0;
        const pct = Math.max(2, Math.min(100, (urgency / 10) * 100));
        const color = HEALTH_COLOR[topic.health_label || ''] || 'var(--color-primary)';
        const npsImpact = topic.nps_impact;
        return (
          <div key={topic.id} className="text-xs">
            <div className="flex items-center justify-between gap-2 mb-0.5">
              <span className="truncate text-on-surface font-medium min-w-0">{topic.name}</span>
              <span className="flex-shrink-0 text-on-surface-variant">
                {urgency.toFixed(1)} {t('dashboard.widget.urgency')}
                {npsImpact != null && (
                  <span className={npsImpact >= 0 ? 'text-success ml-1.5' : 'text-destructive ml-1.5'}>
                    NPS: {npsImpact >= 0 ? '+' : ''}{npsImpact.toFixed(1)}
                  </span>
                )}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--color-outline)]/15 overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
