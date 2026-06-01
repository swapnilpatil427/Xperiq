// TopicAnalysisHubPage — Survey topic browser within the Experience hub.
// Shows the topic hierarchy with sentiment, volume, and per-topic Crystal access.

import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useTopicAnalysis } from '../../hooks/useExperience';
import { useSurveys } from '../../hooks/useSurveys';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useEffect } from 'react';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { ROUTES, toPath } from '../../constants/routes';
import { GlassCard } from '../insights/shared';
import type { SurveyTopic } from '../../types';

const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.05 } } };
const rise = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};

function sentimentStyle(score: number | null | undefined, t: (k: string) => string) {
  if (score == null) return { label: t('experience.common.sentiment.unknown'),  color: '#94a3b8', bg: '#f1f5f9' };
  if (score > 0.3)   return { label: t('experience.common.sentiment.positive'), color: '#059669', bg: '#d1fae5' };
  if (score < -0.3)  return { label: t('experience.common.sentiment.critical'), color: '#b41340', bg: '#fee2e2' };
  return               { label: t('experience.common.sentiment.mixed'),   color: '#d97706', bg: '#fef3c7' };
}

export function TopicAnalysisHubPage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const { t }         = useTranslation();
  const { data, loading } = useTopicAnalysis(surveyId!);
  const { surveys }   = useSurveys();
  const { openCrystal, setScope } = useCrystalPanel();

  const survey = surveys.find((s) => s.id === surveyId);
  useSetPageTitle(survey?.title ?? t('nav.experience'), t('insights.topics.title'));

  // Scope Crystal to this survey on mount
  useEffect(() => {
    if (surveyId) setScope(surveyId);
    return () => setScope('all');
  }, [surveyId, setScope]);

  // data is typed from api.listTopics() → { topics: SurveyTopic[] }
  const topics: SurveyTopic[] = data?.topics ?? [];
  const rootTopics = topics.filter((t) => !t.parent_topic_id);
  const rootIdSet = new Set(rootTopics.map((t) => t.id));
  const childMap: Record<string, SurveyTopic[]> = {};
  topics.forEach((t) => {
    if (t.parent_topic_id) {
      // Only place children under parents that actually exist in the root set.
      // Orphaned children (parent was deleted) are surfaced as root-level topics
      // so data is never silently lost.
      const key = rootIdSet.has(t.parent_topic_id) ? t.parent_topic_id : '__orphaned__';
      (childMap[key] ??= []).push(t);
    }
  });
  // Orphaned topics become synthetic root topics so they're always visible
  const orphaned = childMap['__orphaned__'] ?? [];
  const allRootTopics = [...rootTopics, ...orphaned.map((t) => ({ ...t, parent_topic_id: null as string | null | undefined }))];

  const askAboutTopic = (topicName: string) => {
    if (surveyId) setScope(surveyId);
    openCrystal(t('experience.topics.query.topic', { name: topicName }));
  };

  // Guard: should never happen via normal navigation, but handles direct URL entry
  if (!surveyId) {
    return (
      <div className="max-w-5xl mx-auto w-full pt-12 text-center">
        <p className="text-on-surface-variant mb-4">{t('experience.topics.noSurvey')}</p>
        <Link to={ROUTES.EXPERIENCE}>
          <Button variant="outline" size="sm">{t('experience.topics.back')}</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto w-full space-y-5">

      {/* Sub-nav strip (mirrors SurveyIntelligencePage) */}
      <div className="flex items-center gap-1 flex-wrap">
        {[
          { label: t('experience.nav.intelligence'), icon: 'auto_awesome', path: toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: surveyId! }) },
          { label: t('experience.nav.topics'),       icon: 'hub',          path: toPath(ROUTES.EXPERIENCE_SURVEY_TOPICS, { surveyId: surveyId! }), active: true },
          { label: t('experience.nav.advanced'),     icon: 'analytics',    path: `${ROUTES.ADVANCED_INSIGHTS}?survey=${surveyId}` },
          { label: t('experience.nav.trends'),       icon: 'timeline',     path: toPath(ROUTES.EXPERIENCE_SURVEY_TRENDS, { surveyId: surveyId! }) },
          { label: t('experience.nav.report'),       icon: 'description',  path: toPath(ROUTES.EXPERIENCE_SURVEY_REPORT, { surveyId: surveyId! }) },
        ].map((item) => (
          <Link
            key={item.label}
            to={item.path}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
            style={item.active ? {
              background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))',
              color: 'white',
              boxShadow: '0 2px 8px rgba(42,75,217,0.30)',
            } : {
              background: 'var(--color-surface-container)',
              color: 'var(--color-on-surface-variant)',
            }}
          >
            <Icon name={item.icon} size={13} />
            {item.label}
          </Link>
        ))}
        <div className="flex-1" />
        <Button
          size="sm"
          variant="outline"
          className="text-xs font-bold"
          onClick={() => {
            if (surveyId) setScope(surveyId);
            openCrystal(t('experience.topics.query.all'));
          }}
        >
          <Icon name="psychology" size={13} />
          {t('experience.topics.askAll')}
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black font-headline">{t('insights.topics.title')}</h1>
          {!loading && (
            <p className="text-sm text-on-surface-variant mt-0.5">
              {allRootTopics.length === 1
                ? t('experience.topics.header.countOne', { n: '1' })
                : t('experience.topics.header.countMany', { n: String(allRootTopics.length) })}
              {survey?.response_count ? ' ' + t('experience.topics.header.across', { n: survey.response_count.toLocaleString() }) : ''}
            </p>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-surface-container animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && allRootTopics.length === 0 && (
        <GlassCard className="p-12 text-center">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
            style={{ background: 'linear-gradient(135deg, rgba(42,75,217,0.12), rgba(131,41,200,0.12))' }}>
            <Icon name="hub" size={28} style={{ color: '#2a4bd9' }} />
          </div>
          <h3 className="text-lg font-black font-headline mb-2">{t('insights.topics.empty')}</h3>
          <p className="text-sm text-on-surface-variant mb-5 max-w-xs mx-auto">
            {t('experience.topics.empty.body')}
          </p>
          <Link to={toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: surveyId! })}>
            <Button className="font-bold text-white border-0"
              style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
              <Icon name="auto_awesome" size={15} /> {t('experience.topics.empty.button')}
            </Button>
          </Link>
        </GlassCard>
      )}

      {/* Topic grid */}
      {!loading && allRootTopics.length > 0 && (
        <motion.div
          variants={stagger}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {allRootTopics.map((topic) => {
            const sentiment = sentimentStyle(topic.sentiment_score, t);
            const children  = childMap[topic.id] ?? [];

            return (
              <motion.div key={topic.id} variants={rise}>
                <GlassCard className="overflow-hidden">
                  {/* Topic header row */}
                  <div className="flex items-center gap-4 px-5 py-4">
                    {/* Sentiment dot */}
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ background: sentiment.color }} />

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <Link
                          to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId: surveyId!, topicId: topic.id })}
                          className="font-headline font-bold text-sm text-on-surface hover:text-primary transition-colors"
                        >
                          {topic.name}
                        </Link>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                          style={{ background: sentiment.bg, color: sentiment.color }}>
                          {sentiment.label}
                        </span>
                        {topic.trending && topic.trending !== 'stable' && (
                          <span className="flex items-center gap-0.5 text-[10px] font-bold"
                            style={{ color: topic.trending === 'up' ? '#d97706' : '#94a3b8' }}>
                            <Icon name={topic.trending === 'up' ? 'trending_up' : 'trending_down'} size={12} />
                            {topic.trending}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-on-surface-variant">
                        {topic.volume != null && (
                          <span className="flex items-center gap-1">
                            <Icon name="chat_bubble_outline" size={11} />
                            {t('experience.topics.topic.mentions').replace('{n}', String(topic.volume))}
                          </span>
                        )}
                        {topic.dominant_emotion && (
                          <span className="capitalize">{topic.dominant_emotion}</span>
                        )}
                        {topic.urgency_score != null && topic.urgency_score >= 5 && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] font-black"
                            style={{ background: '#fef2f2', color: '#b91c1c' }}>
                            {t('experience.topics.topic.urgent')}
                          </span>
                        )}
                        {children.length > 0 && (
                          <span>{children.length === 1 ? t('experience.topics.topic.subtopicOne', { n: '1' }) : t('experience.topics.topic.subtopicMany', { n: String(children.length) })}</span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => askAboutTopic(topic.name)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors hover:bg-primary/10"
                        style={{ color: 'var(--color-primary)' }}
                        title={t('experience.topics.topic.ask')}
                      >
                        <Icon name="psychology" size={13} />
                        {t('experience.topics.topic.ask')}
                      </button>
                      <Link
                        to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId: surveyId!, topicId: topic.id })}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-on-surface-variant hover:bg-surface-container transition-colors"
                      >
                        {t('experience.topics.topic.deepDive')}
                        <Icon name="arrow_forward" size={13} />
                      </Link>
                    </div>
                  </div>

                  {/* Sub-topics */}
                  {children.length > 0 && (
                    <div className="border-t border-outline-variant/15 divide-y divide-outline-variant/10">
                      {children.map((child: any) => {
                        const childSent = sentimentStyle(child.sentiment_score, t);
                        return (
                          <div key={child.id} className="flex items-center gap-4 pl-10 pr-5 py-2.5 hover:bg-surface-container/30 transition-colors group">
                            <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                              style={{ background: childSent.color }} />
                            <Link
                              to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId: surveyId!, topicId: child.id })}
                              className="flex-1 text-xs font-medium text-on-surface-variant hover:text-primary transition-colors"
                            >
                              {child.name}
                            </Link>
                            {child.volume != null && (
                              <span className="text-[10px] text-on-surface-variant/60">{child.volume}</span>
                            )}
                            <button
                              onClick={() => askAboutTopic(child.name)}
                              className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all hover:bg-primary/10"
                              style={{ color: 'var(--color-primary)' }}
                            >
                              <Icon name="psychology" size={11} />
                              {t('experience.common.askShort')}
                            </button>
                            <Link
                              to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPIC, { surveyId: surveyId!, topicId: child.id })}
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <Icon name="arrow_forward" size={13} style={{ color: 'var(--color-on-surface-variant)' }} />
                            </Link>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            );
          })}
        </motion.div>
      )}
    </div>
  );
}
