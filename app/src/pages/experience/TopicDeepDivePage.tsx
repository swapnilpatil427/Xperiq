// TopicDeepDivePage — Deep-dive into a single topic.
//
// Data sources (all real — no hardcoding):
//   • api.getTopicDetail()    → topic stats + trend_series + co_occurring + subtopics
//   • api.getTopicVerbatims() → paginated verbatim quotes (separate endpoint)
// Crystal is accessible scoped to this exact topic.

import { useEffect, useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useApi } from '../../hooks/useApi';
import { useSurveys } from '../../hooks/useSurveys';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ROUTES, toPath } from '../../constants/routes';
import { GlassCard } from '../insights/shared';
import type { SurveyTopic, TopicVerbatim, TopicDetail } from '../../types';

const rise = {
  hidden:  { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};

function sentimentColor(s: string | null | undefined) {
  if (s === 'positive') return '#059669';
  if (s === 'negative') return '#b41340';
  return '#94a3b8';
}
function sentimentBg(s: string | null | undefined) {
  if (s === 'positive') return '#d1fae5';
  if (s === 'negative') return '#fee2e2';
  return '#f1f5f9';
}

const SENTIMENT_FILTERS = [
  { value: '',         labelKey: 'experience.topicDetail.verbatims.filter.all' },
  { value: 'positive', labelKey: 'experience.topicDetail.verbatims.filter.positive' },
  { value: 'negative', labelKey: 'experience.topicDetail.verbatims.filter.negative' },
  { value: 'neutral',  labelKey: 'experience.topicDetail.verbatims.filter.neutral' },
];

export function TopicDeepDivePage() {
  const { surveyId, topicId } = useParams<{ surveyId: string; topicId: string }>();
  const { t }                  = useTranslation();
  const api                    = useApi();
  const { surveys }            = useSurveys();
  const { openCrystal, setScope, setCrystalCtx } = useCrystalPanel();

  const survey = surveys.find((s) => s.id === surveyId);

  const [topic,        setTopic]        = useState<SurveyTopic | null>(null);
  const [detail,       setDetail]       = useState<TopicDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(true);

  const [verbatims,       setVerbatims]       = useState<TopicVerbatim[]>([]);
  const [verbatimsTotal,  setVerbatimsTotal]  = useState(0);
  const [verbatimsLoading, setVerbatimsLoading] = useState(false);
  const [hasMore,         setHasMore]         = useState(false);
  const [sentFilter,      setSentFilter]      = useState('');
  const [offset,          setOffset]          = useState(0);
  const PAGE = 10;

  useSetPageTitle(
    topic?.name ?? t('insights.topics.title'),
    survey?.title ?? t('nav.experience'),
  );

  // Scope Crystal to this survey on mount; pass topic context when we have it
  useEffect(() => {
    if (surveyId) setScope(surveyId);
    return () => setScope('all');
  }, [surveyId, setScope]);

  useEffect(() => {
    if (topic?.name) setCrystalCtx({ focused_topic: topic.name });
    return () => setCrystalCtx({});
  }, [topic?.name, setCrystalCtx]);

  // Load topic detail
  useEffect(() => {
    if (!surveyId || !topicId) return;
    setDetailLoading(true);
    api.getTopicDetail(surveyId, topicId)
      .then((r) => { setTopic(r.topic); setDetail(r.detail); })
      .catch(() => {})
      .finally(() => setDetailLoading(false));
  }, [api, surveyId, topicId]);

  // Load verbatims (re-runs when filter or page changes)
  const loadVerbatims = useCallback(async (off: number, sentiment: string) => {
    if (!surveyId || !topicId) return;
    setVerbatimsLoading(true);
    try {
      const r = await api.getTopicVerbatims(surveyId, topicId, {
        limit: PAGE,
        offset: off,
        sentiment: sentiment || undefined,
      });
      // Always use functional update to avoid stale closure — safe for both reset and append
      setVerbatims((prev) => off === 0 ? r.verbatims : [...prev, ...r.verbatims]);
      setVerbatimsTotal(r.total);
      setHasMore(r.has_more);
    } catch {
      setVerbatims([]);
    } finally {
      setVerbatimsLoading(false);
    }
  }, [api, surveyId, topicId]);

  useEffect(() => {
    setOffset(0);
    setVerbatims([]);
    loadVerbatims(0, sentFilter);
  }, [loadVerbatims, sentFilter]);

  const loadMore = () => {
    const next = offset + PAGE;
    setOffset(next);
    loadVerbatims(next, sentFilter);
  };

  const askCrystal = () => {
    if (surveyId) setScope(surveyId);
    openCrystal(
      t('experience.topicDetail.query.topic', { name: topic?.name ?? t('nav.experience') }),
      { focused_topic: topic?.name },
    );
  };

  if (detailLoading) {
    return (
      <div className="max-w-4xl mx-auto w-full space-y-4">
        <div className="h-10 rounded-full bg-surface-container animate-pulse w-2/3" />
        <div className="h-32 rounded-2xl bg-surface-container animate-pulse" />
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-surface-container animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="max-w-4xl mx-auto w-full">
        <GlassCard className="p-12 text-center">
          <Icon name="search_off" size={32} style={{ color: 'var(--color-outline-variant)', margin: '0 auto 12px' }} />
          <p className="font-bold text-on-surface mb-1">{t('experience.topicDetail.notFound.title')}</p>
          <p className="text-sm text-on-surface-variant mb-5">
            {t('experience.topicDetail.notFound.body')}
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {surveyId && (
              <Link to={toPath(ROUTES.EXPERIENCE_SURVEY_TOPICS, { surveyId })}>
                <Button variant="outline" size="sm">{t('experience.topicDetail.notFound.backTopics')}</Button>
              </Link>
            )}
            <Link to={ROUTES.EXPERIENCE}>
              <Button variant="outline" size="sm">{t('experience.topicDetail.notFound.backHub')}</Button>
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  const sentScore    = topic.sentiment_score;
  const sentLabel    = sentScore == null ? '—' : sentScore > 0.3 ? t('experience.common.sentiment.positive') : sentScore < -0.3 ? t('experience.common.sentiment.critical') : t('experience.common.sentiment.mixed');
  const sentColor    = sentScore == null ? '#94a3b8' : sentScore > 0.3 ? '#059669' : sentScore < -0.3 ? '#b41340' : '#d97706';
  const subtopics    = detail?.subtopics ?? [];
  const coOccurring  = detail?.co_occurring ?? [];

  return (
    <TooltipProvider delayDuration={300}>
    <div className="max-w-4xl mx-auto w-full space-y-5">

      {/* ── Sub-nav ─────────────────────────────────────────────────────────── */}
      {surveyId && (
        <div className="flex items-center gap-1 flex-wrap">
          {[
            { label: t('experience.topicDetail.nav.intelligence'), icon: 'auto_awesome', path: toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId }) },
            { label: t('experience.topicDetail.nav.topics'),       icon: 'hub',          path: toPath(ROUTES.EXPERIENCE_SURVEY_TOPICS, { surveyId }), active: true },
            { label: t('experience.topicDetail.nav.advanced'),     icon: 'analytics',    path: `${ROUTES.ADVANCED_INSIGHTS}?survey=${surveyId}` },
            { label: t('experience.topicDetail.nav.trends'),       icon: 'timeline',     path: toPath(ROUTES.EXPERIENCE_SURVEY_TRENDS, { surveyId }) },
          ].map((item) => (
            <Link key={item.label} to={item.path}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
              style={item.active ? {
                background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))',
                color: 'white', boxShadow: '0 2px 8px rgba(42,75,217,0.30)',
              } : { background: 'var(--color-surface-container)', color: 'var(--color-on-surface-variant)' }}
            >
              <Icon name={item.icon} size={13} />{item.label}
            </Link>
          ))}
          <div className="flex-1" />
          <Button size="sm" onClick={askCrystal}
            className="text-xs font-bold text-white border-0"
            style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
            <Icon name="psychology" size={13} /> {t('experience.topicDetail.ask')}
          </Button>
        </div>
      )}

      {/* ── Topic hero card ─────────────────────────────────────────────────── */}
      <motion.div initial="hidden" animate="visible" variants={rise}>
        <GlassCard className="p-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0"
              style={{ background: `${sentColor}18` }}>
              <Icon name="hub" size={24} style={{ color: sentColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap mb-1">
                <h1 className="font-headline font-black text-2xl">{topic.name}</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: `${sentColor}18`, color: sentColor }}>
                  {sentLabel}
                </span>
                {topic.trending && topic.trending !== 'stable' && (
                  <span className="flex items-center gap-1 text-xs font-bold"
                    style={{ color: topic.trending === 'up' ? '#d97706' : '#64748b' }}>
                    <Icon name={topic.trending === 'up' ? 'trending_up' : 'trending_down'} size={14} />
                    {topic.trending}
                  </span>
                )}
                {topic.chronic && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black"
                    style={{ background: '#fdf4ff', color: '#9333ea' }}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>{t('experience.topicDetail.chronic.label')}</span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs max-w-[200px]">
                        {t('experience.topicDetail.chronic.tooltip')}
                      </TooltipContent>
                    </Tooltip>
                  </span>
                )}
              </div>

              {/* Stat row */}
              <div className="flex items-center gap-5 text-sm text-on-surface-variant flex-wrap">
                <span className="flex items-center gap-1">
                  <Icon name="chat_bubble_outline" size={14} />
                  {t('experience.topicDetail.hero.mentions', { n: topic.volume?.toLocaleString() ?? '—' })}
                </span>
                {topic.sentiment_score != null && (
                  <span className="flex items-center gap-1">
                    <Icon name="sentiment_satisfied" size={14} />
                    {t('experience.topicDetail.hero.sentiment', { n: (topic.sentiment_score * 100).toFixed(0) })}
                  </span>
                )}
                {topic.effort_score != null && (
                  <span className="flex items-center gap-1">
                    <Icon name="speed" size={14} />
                    {t('experience.topicDetail.hero.effort', { n: topic.effort_score.toFixed(1) })}
                  </span>
                )}
                {topic.nps_impact != null && (
                  <span className="flex items-center gap-1">
                    <Icon name="trending_flat" size={14} />
                    <strong style={{ color: topic.nps_impact > 0 ? '#059669' : '#b41340' }}>
                      {topic.nps_impact > 0 ? '+' : ''}{topic.nps_impact.toFixed(1)}
                    </strong>
                    {' '}{t('experience.topicDetail.hero.npsImpactSuffix')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </GlassCard>
      </motion.div>

      {/* ── Subtopics ───────────────────────────────────────────────────────── */}
      {subtopics.length > 0 && (
        <motion.section initial="hidden" animate="visible" variants={rise}>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
            {t('experience.topicDetail.subtopics.title', { n: String(subtopics.length) })}
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {subtopics.map((sub) => {
              const sc = sub.sentiment_score;
              const sc2 = sc == null ? '#94a3b8' : sc > 0.3 ? '#059669' : sc < -0.3 ? '#b41340' : '#d97706';
              return (
                <GlassCard key={sub.id} className="px-4 py-3 flex items-center gap-3 group hover:shadow-md transition-shadow">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: sc2 }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">{sub.name}</div>
                    <div className="text-[10px] text-on-surface-variant">{t('experience.topicDetail.subtopics.mentions', { n: String(sub.volume) })}</div>
                  </div>
                  <button
                    onClick={() => { if (surveyId) setScope(surveyId); openCrystal(t('experience.topicDetail.subtopics.query', { name: sub.name }), { focused_topic: sub.name }); }}
                    className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all hover:bg-primary/10"
                    style={{ color: 'var(--color-primary)' }}
                  >
                    <Icon name="psychology" size={11} /> {t('experience.topicDetail.subtopics.ask')}
                  </button>
                </GlassCard>
              );
            })}
          </div>
        </motion.section>
      )}

      {/* ── Co-occurring topics ─────────────────────────────────────────────── */}
      {coOccurring.length > 0 && (
        <motion.section initial="hidden" animate="visible" variants={rise}>
          <h2 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
            {t('experience.topicDetail.coOccurring.title')}
          </h2>
          <div className="flex flex-wrap gap-2">
            {coOccurring.slice(0, 8).map((co) => (
              <span key={co.name}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-surface-container text-on-surface-variant">
                {co.name}
                <span className="text-[10px] opacity-60">{co.co_count}</span>
              </span>
            ))}
            {coOccurring.length > 8 && (
              <span className="flex items-center px-3 py-1.5 rounded-full text-xs font-bold text-on-surface-variant/60 bg-surface-container/50">
                {t('experience.topicDetail.coOccurring.more', { n: String(coOccurring.length - 8) })}
              </span>
            )}
          </div>
        </motion.section>
      )}

      {/* ── Verbatims ───────────────────────────────────────────────────────── */}
      <motion.section initial="hidden" animate="visible" variants={rise}>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {t('insights.verbatims.title')}
            </h2>
            {verbatimsTotal > 0 && (
              <span className="text-[10px] text-on-surface-variant/60">
                {t('experience.topicDetail.verbatims.totalLabel', { n: verbatimsTotal.toLocaleString() })}
              </span>
            )}
          </div>
          {/* Sentiment filter */}
          <div className="flex items-center gap-1">
            {SENTIMENT_FILTERS.map((f) => (
              <button key={f.value}
                onClick={() => setSentFilter(f.value)}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all"
                style={sentFilter === f.value ? {
                  background: 'var(--color-primary)',
                  color: 'white',
                } : {
                  background: 'var(--color-surface-container)',
                  color: 'var(--color-on-surface-variant)',
                }}
              >
                {t(f.labelKey)}
              </button>
            ))}
          </div>
        </div>

        {/* Verbatim cards */}
        <div className="space-y-2">
          {verbatims.map((v, i) => (
            <GlassCard key={`${v.response_id}-${i}`}
              className="px-4 py-3 group hover:shadow-md transition-shadow"
              style={{ borderLeft: `3px solid ${sentimentColor(v.sentiment)}` }}>
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-relaxed text-on-surface">"{v.text}"</p>
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-on-surface-variant flex-wrap">
                    {v.sentiment && (
                      <span className="px-1.5 py-0.5 rounded font-bold capitalize"
                        style={{ background: sentimentBg(v.sentiment), color: sentimentColor(v.sentiment) }}>
                        {v.sentiment}
                      </span>
                    )}
                    {v.nps_score != null && (
                      <span className="flex items-center gap-1">
                        NPS <strong style={{
                          color: v.nps_score >= 9 ? '#059669' : v.nps_score >= 7 ? '#d97706' : '#b41340',
                        }}>{v.nps_score}</strong>
                      </span>
                    )}
                    <span>{new Date(v.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (surveyId) setScope(surveyId);
                    openCrystal(
                      t('experience.topicDetail.query.verbatim', { quote: v.text.slice(0, 120), topic: topic.name }),
                      { focused_topic: topic.name },
                    );
                  }}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold transition-all hover:bg-primary/10 mt-0.5"
                  style={{ color: 'var(--color-primary)' }}
                  title={t('experience.topicDetail.ask')}
                >
                  <Icon name="psychology" size={12} /> {t('experience.common.askShort')}
                </button>
              </div>
            </GlassCard>
          ))}

          {verbatimsLoading && (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-xl bg-surface-container animate-pulse" />
              ))}
            </div>
          )}

          {!verbatimsLoading && verbatims.length === 0 && (
            <GlassCard className="p-8 text-center">
              <Icon name="chat_bubble_outline" size={28} style={{ color: 'var(--color-outline-variant)', margin: '0 auto 8px' }} />
              {sentFilter ? (
                <>
                  <p className="text-sm font-bold text-on-surface mb-1">{t('experience.topicDetail.verbatims.noMatchTitle', { sentiment: sentFilter })}</p>
                  <p className="text-xs text-on-surface-variant mb-3">
                    {t('experience.topicDetail.verbatims.noMatchBody', { sentiment: sentFilter })}
                  </p>
                  <button onClick={() => setSentFilter('')}
                    className="text-xs font-bold text-primary hover:underline">
                    {t('experience.topicDetail.verbatims.clearFilter')}
                  </button>
                </>
              ) : (
                <p className="text-sm text-on-surface-variant">{t('insights.verbatims.empty')}</p>
              )}
            </GlassCard>
          )}

          {hasMore && !verbatimsLoading && (
            <div className="text-center pt-2">
              <Button variant="outline" size="sm" onClick={loadMore} className="text-xs font-bold">
                {t('experience.topicDetail.verbatims.loadMore')}
              </Button>
            </div>
          )}
        </div>
      </motion.section>
    </div>
    </TooltipProvider>
  );
}
