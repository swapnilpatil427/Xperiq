import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SideNav } from '../components/SideNav';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { PauseModal, ResumeModal } from '../components/SurveyActionModal';
import { useSurveys } from '../hooks/useSurveys';
import { pageStore } from '../lib/pageStore';
import { ROUTES } from '../constants/routes';
import { NPS as NPS_THRESHOLDS } from '../constants/thresholds';
import { SENTIMENT_COLORS } from '../constants/colors';
import { useTranslation } from '../lib/i18n';

const STATUS_CLASS = {
  active: 'badge badge-success',
  draft:  'badge badge-neutral',
  paused: 'badge badge-warning',
};

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] },
  }),
};

const stagger = {
  visible: { transition: { staggerChildren: 0.07, delayChildren: 0.1 } },
};

export function SurveysListPage({ onNavigate, currentPage }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');
  const { surveys, loading, error, updateSurvey } = useSurveys();
  const [statusChanging, setStatusChanging] = useState(null);
  const [pauseTarget,    setPauseTarget]    = useState(null); // { id, title, responseCount }
  const [resumeTarget,   setResumeTarget]   = useState(null);

  const filtered = filter === 'all' ? surveys : surveys.filter((s) => s.status === filter);
  const activeCount = surveys.filter((s) => s.status === 'active').length;
  const totalResponses = surveys.reduce((acc, s) => acc + (s.responseCount || s.responses || 0), 0);
  const avgNps = surveys.filter((s) => s.npsScore != null || s.nps != null).reduce((acc, s, _i, arr) => {
    return acc + (s.npsScore ?? s.nps ?? 0) / arr.length;
  }, 0);

  const statusLabel = (status) => t(`surveys.statusLabels.${status}`) || status;

  const npsColor = (score) => {
    if (score >= NPS_THRESHOLDS.POSITIVE_MIN) return '#059669';
    if (score >= NPS_THRESHOLDS.NEUTRAL_MIN)  return '#d97706';
    return '#b41340';
  };

  const kpiCards = [
    {
      label: t('surveys.metrics.totalSurveys'),
      value: surveys.length,
      icon: 'poll',
      gradient: 'linear-gradient(135deg, rgba(42,75,217,0.08), rgba(42,75,217,0.02))',
      iconColor: '#2a4bd9',
    },
    {
      label: t('surveys.metrics.active'),
      value: activeCount,
      icon: 'play_circle',
      gradient: 'linear-gradient(135deg, rgba(5,150,105,0.08), rgba(5,150,105,0.02))',
      iconColor: '#059669',
    },
    {
      label: t('surveys.metrics.responses'),
      value: totalResponses.toLocaleString(),
      icon: 'forum',
      gradient: 'linear-gradient(135deg, rgba(131,41,200,0.08), rgba(131,41,200,0.02))',
      iconColor: '#8329c8',
    },
    {
      label: t('surveys.metrics.avgNps'),
      value: surveys.some((s) => s.npsScore != null || s.nps != null)
        ? Math.round(avgNps)
        : '—',
      icon: 'thumb_up',
      gradient: 'linear-gradient(135deg, rgba(217,119,6,0.08), rgba(217,119,6,0.02))',
      iconColor: '#d97706',
    },
  ];

  return (
    <div className="flex min-h-screen bg-surface">
      <SideNav currentPage={currentPage} onNavigate={onNavigate} />
      <BottomNav currentPage={currentPage} onNavigate={onNavigate} />

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <TopBar
          title={t('surveys.pageTitle')}
          subtitle={t('surveys.activeSurveysSubtitle', { n: activeCount })}
          currentPage={currentPage}
          onNavigate={onNavigate}
        />

        <div className="pt-20 pb-12 px-6 md:px-8 max-w-6xl mx-auto w-full">

          {/* KPI row */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {kpiCards.map((card, i) => (
              <motion.div
                key={card.label}
                custom={i}
                variants={fadeUp}
                className="rounded-2xl p-4 flex items-center gap-3"
                style={{
                  background: card.gradient,
                  border: '1px solid rgba(171,173,175,0.12)',
                  backdropFilter: 'blur(8px)',
                }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: 'rgba(255,255,255,0.7)', color: card.iconColor }}
                >
                  <Icon name={card.icon} size={20} />
                </div>
                <div>
                  <p className="label-caps">{card.label}</p>
                  <p className="text-xl font-black font-headline text-on-surface">{card.value}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Header row */}
          <motion.div
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0.5}
          >
            <div>
              <h1 className="text-2xl font-extrabold tracking-tighter font-headline text-on-surface">
                {t('surveys.libraryHeading')}
              </h1>
              <p className="text-sm mt-0.5 text-on-surface-variant">
                {t('surveys.countDescription', {
                  count: surveys.length,
                  responses: totalResponses.toLocaleString(),
                })}
              </p>
            </div>

            <div className="flex items-center gap-3">
              <motion.button
                onClick={() => onNavigate(ROUTES.CREATE)}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white bg-gradient-primary font-headline rounded-xl"
                style={{
                  boxShadow: '0 10px 25px -5px rgba(42,75,217,0.35)',
                }}
                whileHover={{ scale: 1.03, boxShadow: '0 14px 30px -5px rgba(42,75,217,0.45)' }}
                whileTap={{ scale: 0.97 }}
              >
                <Icon name="auto_awesome" size={16} />
                {t('surveys.createWithAI')}
              </motion.button>
              <motion.button
                onClick={() => onNavigate(ROUTES.BUILDER)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-bold font-headline text-on-surface rounded-xl"
                style={{ background: 'rgba(255,255,255,0.8)', borderRadius: '0.75rem', border: '1px solid rgba(171,173,175,0.2)' }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
              >
                <Icon name="add" size={16} />
                {t('surveys.manual')}
              </motion.button>
            </div>
          </motion.div>

          {/* Filter pills */}
          <motion.div
            className="flex gap-2 mb-6 flex-wrap"
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            custom={0.7}
          >
            {['all', 'active', 'draft', 'paused'].map((f) => {
              const STATUS_TAB = { active: 'Live', draft: 'Draft', paused: 'Paused' };
              const label = f === 'all'
                ? t('surveys.filterAll', { n: surveys.length })
                : `${STATUS_TAB[f]} (${surveys.filter((s) => s.status === f).length})`;
              const isActive = filter === f;
              return (
                <motion.button
                  key={f}
                  onClick={() => setFilter(f)}
                  className="px-4 py-1.5 text-xs font-bold capitalize rounded-full"
                  style={{
                    background: isActive ? 'linear-gradient(135deg, #2a4bd9, #8329c8)' : 'rgba(255,255,255,0.7)',
                    color: isActive ? '#ffffff' : '#595c5e',
                    border: isActive ? 'none' : '1px solid rgba(171,173,175,0.2)',
                    boxShadow: isActive ? '0 4px 12px rgba(42,75,217,0.25)' : 'none',
                  }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  {label}
                </motion.button>
              );
            })}
          </motion.div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="w-8 h-8 rounded-full border-2 animate-spin"
                style={{ borderColor: 'rgba(42,75,217,0.2)', borderTopColor: '#2a4bd9' }} />
            </div>
          )}

          {/* Error */}
          {error && !loading && (
            <div className="banner-error mb-6">
              {t('surveys.errorLoading', { message: error })}
            </div>
          )}

          {/* Survey cards */}
          {!loading && (
            <AnimatePresence mode="popLayout">
              <motion.div
                className="space-y-3"
                variants={stagger}
                initial="hidden"
                animate="visible"
                key={filter}
              >
                {filtered.map((survey, i) => {
                  const statusClass = STATUS_CLASS[survey.status] || STATUS_CLASS.draft;
                  const responseCount = survey.responseCount ?? survey.responses ?? 0;
                  const npsScore = survey.npsScore ?? survey.nps ?? null;
                  const topics = survey.topics || [];
                  const sentiment = survey.sentiment || null;

                  return (
                    <motion.div
                      key={survey.id}
                      custom={i}
                      variants={fadeUp}
                      layout
                      className="group flex flex-col sm:flex-row sm:items-center gap-4 p-5 rounded-2xl cursor-pointer relative overflow-hidden"
                      style={{
                        background: 'rgba(255,255,255,0.75)',
                        backdropFilter: 'blur(16px)',
                        WebkitBackdropFilter: 'blur(16px)',
                        boxShadow: '0 4px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
                        border: '1px solid rgba(255,255,255,0.6)',
                      }}
                      whileHover={{
                        y: -3,
                        boxShadow: '0 20px 40px -8px rgba(42,75,217,0.14), inset 0 1px 0 rgba(255,255,255,0.8)',
                        transition: { duration: 0.2 },
                      }}
                    >
                      {/* Subtle gradient overlay on hover */}
                      <div
                        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                        style={{
                          background: 'linear-gradient(135deg, rgba(42,75,217,0.02), rgba(131,41,200,0.01))',
                          borderRadius: 'inherit',
                        }}
                      />

                      {/* Status + title */}
                      <div className="flex-1 min-w-0 relative">
                        <div className="flex items-center gap-3 mb-2">
                          <span className={statusClass}>
                            {statusLabel(survey.status)}
                          </span>
                          {sentiment && (
                            <div className="flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full"
                                style={{ background: SENTIMENT_COLORS[sentiment] }} />
                              <span className="text-[10px] font-bold uppercase tracking-wider"
                                style={{ color: SENTIMENT_COLORS[sentiment] }}>
                                {sentiment}
                              </span>
                            </div>
                          )}
                        </div>
                        <h3 className="font-bold text-base truncate mb-1.5 font-headline text-on-surface">
                          {survey.title}
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {topics.map((topic) => (
                            <span key={topic} className="tag-topic">{topic}</span>
                          ))}
                        </div>
                      </div>

                      {/* Metrics */}
                      <div className="flex items-center gap-6 text-right shrink-0 relative">
                        <div>
                          <p className="label-caps">{t('surveys.metrics.responses')}</p>
                          <p className="text-xl font-black font-headline text-on-surface">
                            {responseCount.toLocaleString()}
                          </p>
                        </div>
                        {npsScore !== null && (
                          <div>
                            <p className="label-caps">{t('surveys.metrics.nps')}</p>
                            <p className="text-xl font-black font-headline"
                              style={{ color: npsColor(npsScore) }}>
                              {npsScore}
                            </p>
                          </div>
                        )}
                        <div>
                          <p className="label-caps">{t('surveys.metrics.updated')}</p>
                          <p className="text-sm font-semibold text-on-surface-variant">
                            {survey.updatedAt
                              ? new Date(survey.updatedAt).toLocaleDateString()
                              : survey.lastUpdated || '—'}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2 shrink-0 relative">
                        {/* Pause / Resume — open confirmation modals */}
                        {survey.status === 'active' && (
                          <motion.button
                            onClick={(e) => { e.stopPropagation(); setPauseTarget({ id: survey.id, title: survey.title, responseCount: responseCount }); }}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl"
                            style={{ background: 'rgba(217,119,6,0.08)', color: '#d97706' }}
                            whileHover={{ background: 'rgba(217,119,6,0.15)', scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                          >
                            <Icon name="pause" size={14} />Pause
                          </motion.button>
                        )}
                        {survey.status === 'paused' && (
                          <motion.button
                            onClick={(e) => { e.stopPropagation(); setResumeTarget({ id: survey.id, title: survey.title, responseCount: responseCount }); }}
                            className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-white"
                            style={{ background: 'linear-gradient(135deg, #059669, #047857)' }}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                          >
                            <Icon name="play_arrow" size={14} />Resume
                          </motion.button>
                        )}
                        <motion.button
                          onClick={(e) => { e.stopPropagation(); onNavigate(ROUTES.INSIGHTS); }}
                          className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl text-primary"
                          style={{ background: 'rgba(42,75,217,0.08)' }}
                          whileHover={{ background: 'rgba(42,75,217,0.14)', scale: 1.03 }}
                          whileTap={{ scale: 0.96 }}
                        >
                          <Icon name="insights" size={14} />
                          {t('surveys.actions.insights')}
                        </motion.button>
                        <motion.button
                          onClick={(e) => {
                            e.stopPropagation();
                            pageStore.setPendingBuilderData({
                              id:           survey.id,
                              title:        survey.title,
                              questions:    survey.questions || [],
                              surveyTypeId: survey.survey_type_id || survey.surveyTypeId || null,
                            });
                            onNavigate(ROUTES.BUILDER);
                          }}
                          className="p-2 rounded-xl text-on-surface-variant"
                          whileHover={{ background: 'rgba(171,173,175,0.15)', scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          <Icon name="edit" size={16} />
                        </motion.button>
                      </div>
                    </motion.div>
                  );
                })}

                {/* Empty state */}
                {filtered.length === 0 && (
                  <motion.div
                    variants={fadeUp}
                    className="text-center py-24"
                  >
                    <motion.div
                      className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-5"
                      style={{ background: 'linear-gradient(135deg, rgba(42,75,217,0.08), rgba(131,41,200,0.05))', border: '1px solid rgba(42,75,217,0.1)' }}
                      animate={{ y: [0, -6, 0] }}
                      transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                    >
                      <Icon name="assignment" size={36} className="text-primary" />
                    </motion.div>
                    <h3 className="text-xl font-bold mb-2 font-headline text-on-surface">
                      {t('surveys.empty.heading')}
                    </h3>
                    <p className="text-sm mb-6 max-w-xs mx-auto text-on-surface-variant">
                      {t('surveys.empty.description')}
                    </p>
                    <motion.button
                      onClick={() => onNavigate(ROUTES.CREATE)}
                      className="px-6 py-3 text-white font-bold text-sm bg-gradient-primary font-headline rounded-xl"
                      style={{
                        boxShadow: '0 10px 25px -5px rgba(42,75,217,0.35)',
                      }}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                    >
                      {t('surveys.empty.cta')}
                    </motion.button>
                  </motion.div>
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </div>
      </main>

      {/* Pause confirmation */}
      <PauseModal
        open={!!pauseTarget}
        onClose={() => setPauseTarget(null)}
        surveyTitle={pauseTarget?.title}
        responseCount={pauseTarget?.responseCount ?? 0}
        busy={statusChanging === pauseTarget?.id}
        onConfirm={async () => {
          setStatusChanging(pauseTarget.id);
          await updateSurvey(pauseTarget.id, { status: 'paused' });
          setStatusChanging(null);
          setPauseTarget(null);
        }}
      />

      {/* Resume confirmation */}
      <ResumeModal
        open={!!resumeTarget}
        onClose={() => setResumeTarget(null)}
        surveyTitle={resumeTarget?.title}
        responseCount={resumeTarget?.responseCount ?? 0}
        busy={statusChanging === resumeTarget?.id}
        onConfirm={async () => {
          setStatusChanging(resumeTarget.id);
          await updateSurvey(resumeTarget.id, { status: 'active' });
          setStatusChanging(null);
          setResumeTarget(null);
        }}
      />
    </div>
  );
}
