import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { useApi } from '../../../hooks/useApi';
import { useTranslation } from '../../../lib/i18n';
import { Icon } from '../../Icon';
import { ROUTES } from '../../../constants/routes';
import type { DashboardFilters } from '../../../types/dashboard';
import type { SurveyResponse } from '../../../types';

interface RecentResponsesWidgetProps {
  filters: DashboardFilters;
}

const SENTIMENT_ICON: Record<string, string> = {
  positive: 'sentiment_satisfied',
  negative: 'sentiment_dissatisfied',
  neutral:  'sentiment_neutral',
  mixed:    'sentiment_neutral',
};

const SENTIMENT_COLOR: Record<string, string> = {
  positive: '#10b981',
  negative: '#ef4444',
  neutral:  '#94a3b8',
  mixed:    '#f59e0b',
};

function npsColor(score: number | null | undefined): string {
  if (score == null) return '#94a3b8';
  if (score >= 9) return '#10b981';
  if (score >= 7) return '#f59e0b';
  return '#ef4444';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export function RecentResponsesWidget({ filters }: RecentResponsesWidgetProps) {
  const { t } = useTranslation();
  const api = useApi();
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!filters.surveyId) {
      setResponses([]);
      return;
    }
    setLoading(true);
    api
      .getResponses(filters.surveyId, { limit: 6 })
      .then((r) => setResponses(r.responses || []))
      .catch(() => setResponses([]))
      .finally(() => setLoading(false));
  }, [api, filters.surveyId]);

  if (!filters.surveyId) {
    return (
      <div className="py-8 flex flex-col items-center text-center gap-2">
        <Icon name="forum" size={28} className="text-on-surface-variant/30" />
        <p className="text-sm text-on-surface-variant/60">{t('dashboard.widget.recentResponsesPrompt')}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="skeleton h-10 rounded-lg" />)}
      </div>
    );
  }

  if (responses.length === 0) {
    return <p className="text-sm text-on-surface-variant/60 py-8 text-center">{t('dashboard.widget.noRecentResponses')}</p>;
  }

  return (
    <div>
      <div className="space-y-1.5">
        {responses.map((resp, idx) => {
          const sentiment = resp.ai_sentiment ?? 'neutral';
          const nps = resp.nps_score;

          return (
            <motion.div
              key={resp.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: idx * 0.04, ease: [0.22, 1, 0.36, 1] }}
              className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-black/[0.03] transition-colors group"
            >
              {/* Sentiment icon */}
              <span style={{ color: SENTIMENT_COLOR[sentiment] }} className="flex-shrink-0">
                <Icon name={SENTIMENT_ICON[sentiment] ?? 'sentiment_neutral'} size={16} fill={1} />
              </span>

              {/* NPS badge */}
              {nps != null && (
                <span
                  className="flex-shrink-0 text-[10px] font-black tabular-nums px-1.5 py-0.5 rounded-full"
                  style={{
                    background: `${npsColor(nps)}18`,
                    color: npsColor(nps),
                    minWidth: '2.5rem',
                    textAlign: 'center',
                  }}
                >
                  {nps >= 9 ? '😊' : nps >= 7 ? '😐' : '😞'} {nps >= 0 ? '+' : ''}{nps}
                </span>
              )}

              {/* First text answer snippet */}
              <span className="flex-1 min-w-0 text-xs text-on-surface/80 truncate">
                {Array.isArray(resp.answers) && resp.answers.length > 0
                  ? String((resp.answers as Array<{value?: unknown}>).find(a => typeof a?.value === 'string')?.value ?? t('dashboard.widget.anonymous'))
                  : t('dashboard.widget.anonymous')}
              </span>

              {/* Time ago */}
              <span className="text-[10px] text-on-surface-variant/50 flex-shrink-0 tabular-nums">
                {timeAgo(resp.submitted_at)}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* Footer link */}
      <div className="mt-3 pt-2.5 border-t border-black/[0.05] flex justify-end">
        <Link
          to={ROUTES.DATA}
          className="text-xs font-semibold flex items-center gap-1 hover:opacity-80 transition-opacity"
          style={{ color: 'var(--color-primary)' }}
        >
          {t('dashboard.widget.viewAllResponses')}
          <Icon name="arrow_forward" size={12} />
        </Link>
      </div>
    </div>
  );
}
