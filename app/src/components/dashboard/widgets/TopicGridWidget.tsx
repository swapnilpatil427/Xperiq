import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useApi } from '../../../hooks/useApi';
import { useTranslation } from '../../../lib/i18n';
import type { DashboardFilters } from '../../../types/dashboard';
import type { SurveyTopic } from '../../../types';

interface TopicGridWidgetProps {
  filters: DashboardFilters;
}

const HEALTH_GRADIENT: Record<string, string> = {
  healthy:  'linear-gradient(90deg, #10b981, #34d399)',
  stable:   'linear-gradient(90deg, var(--color-primary), #818cf8)',
  'at-risk':'linear-gradient(90deg, #ef4444, #f97316)',
};

const HEALTH_COLOR: Record<string, string> = {
  healthy:  '#10b981',
  stable:   'var(--color-primary)',
  'at-risk':'#ef4444',
};

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
    return (
      <p className="text-sm text-on-surface-variant/60 py-10 text-center">
        {t('dashboard.widget.topicsPrompt')}
      </p>
    );
  }
  if (loading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-7 rounded-lg" />)}
      </div>
    );
  }
  if (topics.length === 0) {
    return <p className="text-sm text-on-surface-variant/60 py-10 text-center">{t('dashboard.widget.noData')}</p>;
  }

  return (
    <div className="space-y-3">
      {topics.map((topic, idx) => {
        const urgency = topic.urgency_score ?? 0;
        const pct = Math.max(2, Math.min(100, (urgency / 10) * 100));
        const label = topic.health_label || '';
        const gradient = HEALTH_GRADIENT[label] || HEALTH_GRADIENT.stable;
        const color = HEALTH_COLOR[label] || 'var(--color-primary)';
        const npsImpact = topic.nps_impact;

        return (
          <motion.div
            key={topic.id}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
            className="text-xs"
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="truncate text-on-surface font-semibold min-w-0">{topic.name}</span>
              <span className="flex-shrink-0 flex items-center gap-1.5 text-on-surface-variant/70">
                <span className="font-bold tabular-nums" style={{ color }}>
                  {urgency.toFixed(1)}
                </span>
                {npsImpact != null && (
                  <span
                    className="px-1.5 py-0.5 rounded-full font-bold tabular-nums text-[10px]"
                    style={{
                      background: npsImpact >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
                      color: npsImpact >= 0 ? '#10b981' : '#ef4444',
                    }}
                  >
                    NPS {npsImpact >= 0 ? '+' : ''}{npsImpact.toFixed(1)}
                  </span>
                )}
              </span>
            </div>
            <div
              className="h-2 w-full rounded-full overflow-hidden"
              style={{ background: 'var(--color-outline, rgba(0,0,0,0.08))' }}
            >
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.6, delay: idx * 0.04 + 0.1, ease: [0.22, 1, 0.36, 1] }}
                style={{ background: gradient }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
