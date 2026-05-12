import { useState } from 'react';
import { motion } from 'framer-motion';
import { SideNav } from '../components/SideNav';
import { TopBar } from '../components/TopBar';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { useInsights } from '../hooks/useInsights';
import { useSurveys } from '../hooks/useSurveys';
import { SENTIMENT } from '../constants/thresholds';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.5, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] },
  }),
};
const stagger = { visible: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } };

const topics = [
  {
    id: 'interface',
    icon: 'space_dashboard',
    iconBg: '#e0e7ff',
    iconColor: '#4338ca',
    title: 'Interface Efficiency',
    volume: '342 VOL',
    signal: 'Strong Positive',
    signalColor: '#059669',
    signalDot: '#10b981',
    active: false,
  },
  {
    id: 'revenue',
    icon: 'payments',
    iconBg: '#fef3c7',
    iconColor: '#d97706',
    title: 'Revenue Value Gap',
    volume: '1,204 VOL',
    signal: 'Neutral Signal',
    signalColor: '#d97706',
    signalDot: '#f59e0b',
    active: false,
  },
  {
    id: 'onboarding',
    icon: 'rocket_launch',
    iconBg: 'rgba(255,255,255,0.2)',
    iconColor: '#ffffff',
    title: 'Onboarding Velocity',
    volume: '892 VOL',
    signal: 'Critical Attention',
    signalColor: '#ffffff',
    signalDot: '#ffffff',
    active: true,
  },
  {
    id: 'support',
    icon: 'support_agent',
    iconBg: '#d1fae5',
    iconColor: '#047857',
    title: 'Support Resonance',
    volume: '215 VOL',
    signal: 'Strong Positive',
    signalColor: '#059669',
    signalDot: '#10b981',
    active: false,
  },
];

const frictionPoints = [
  { phrase: '"Too many steps to create project"', count: '42 INSTANCES' },
  { phrase: '"Confusing interface navigation"', count: '38 INSTANCES' },
  { phrase: '"Email verification loop"', count: '24 INSTANCES' },
];

const sampleResponses = [
  {
    id: '#1204',
    time: '48H AGO',
    text: '"I spent 15 minutes just trying to find where to upload my data. The onboarding tutorial skips over the most important part of project setup, causing immediate friction for our enterprise team."',
  },
  {
    id: '#883',
    time: '72H AGO',
    text: '"The onboarding is way too long. We need tool proficiency in minutes, not hours. I just want to use the tool, not watch 5 minutes of videos before I can even click a button."',
  },
];

const recommendedThemes = [
  { icon: 'verified_user', bg: '#f0fdf4', color: '#059669', label: 'Product Experience' },
  { icon: 'payments', bg: '#fffbeb', color: '#d97706', label: 'Revenue & Value' },
];

const TOPIC_ICONS = ['space_dashboard', 'payments', 'rocket_launch', 'support_agent', 'psychology', 'analytics'];
const TOPIC_COLORS = [
  { iconBg: '#e0e7ff', iconColor: '#4338ca', signalDot: '#10b981' },
  { iconBg: '#fef3c7', iconColor: '#d97706', signalDot: '#f59e0b' },
  { iconBg: '#ffe0e6', iconColor: '#b41340', signalDot: '#b41340' },
  { iconBg: '#d1fae5', iconColor: '#047857', signalDot: '#10b981' },
  { iconBg: '#f3e8ff', iconColor: '#8329c8', signalDot: '#8329c8' },
  { iconBg: '#e0f7ff', iconColor: '#0284c7', signalDot: '#0284c7' },
];

function sentimentToSignal(sentiment, t) {
  if (sentiment === 'positive') return { signal: t('insights.signals.strongPositive'), signalColor: '#059669' };
  if (sentiment === 'negative') return { signal: t('insights.signals.critical'),       signalColor: '#b41340' };
  return                               { signal: t('insights.signals.neutral'),         signalColor: '#d97706' };
}

export function InsightsDashboardPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState('analysis');
  const { surveys } = useSurveys();
  const activeSurvey = surveys.find((s) => s.status === 'active') || surveys[0];
  const { insights, generating, regenerate } = useInsights(activeSurvey?.id);

  return (
    <div className="flex min-h-screen bg-surface">
      <SideNav />
      <BottomNav />

      <main className="flex-1 md:ml-64 flex flex-col min-h-screen">
        <TopBar
          title={t('insights.pageTitle')}
          subtitle={t('insights.dateFilter')}
        />

        {/* Dashboard Canvas */}
        <div className="pt-20 pb-12 px-6 md:px-8 space-y-8 max-w-7xl mx-auto w-full">

          {/* NPS + CSAT */}
          <motion.section
            className="grid grid-cols-1 lg:grid-cols-2 gap-6"
            variants={stagger}
            initial="hidden"
            animate="visible"
          >
            {/* NPS */}
            <motion.div
              custom={0}
              variants={fadeUp}
              className="glass-card-premium p-8 rounded-2xl flex items-center gap-8 group"
              style={{
                boxShadow: '0 4px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
                border: '1px solid rgba(255,255,255,0.6)',
              }}
              whileHover={{ y: -3, boxShadow: '0 20px 40px -8px rgba(42,75,217,0.12)' }}
            >
              <div className="relative z-10 flex flex-col justify-center">
                <p className="label-caps mb-2">
                  {t('insights.npsLabel')}
                </p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-6xl font-extrabold font-headline text-on-surface">
                    {insights?.npsScore ?? 74}
                  </h3>
                  <Badge variant="success" className="text-xs font-bold px-2 py-0.5">
                    +4.2%
                  </Badge>
                </div>
                <div className="mt-4">
                  <svg className="w-32 h-8" viewBox="0 0 100 25">
                    <path
                      className="sparkline-svg"
                      d="M0,20 Q10,5 20,18 T40,10 T60,22 T80,5 T100,15"
                      fill="none"
                      stroke="#2a4bd9"
                      strokeWidth="2.5"
                    />
                  </svg>
                </div>
              </div>
              <div className="relative z-10 ml-auto">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                    <circle cx="64" cy="64" r="56" fill="transparent" stroke="#f3f4f6" strokeWidth="8" />
                    <circle
                      cx="64" cy="64" r="56" fill="transparent"
                      stroke="#2a4bd9"
                      strokeWidth="8"
                      strokeDasharray="351.85"
                      strokeDashoffset="87.96"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black font-headline text-on-surface">
                      74%
                    </span>
                    <span className="text-[9px] uppercase font-bold tracking-tighter label-caps">
                      {t('insights.npsExcellent')}
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* CSAT */}
            <motion.div
              custom={1}
              variants={fadeUp}
              className="glass-card-premium p-8 rounded-2xl flex items-center gap-8 group"
              style={{
                boxShadow: '0 4px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
                border: '1px solid rgba(255,255,255,0.6)',
              }}
              whileHover={{ y: -3, boxShadow: '0 20px 40px -8px rgba(131,41,200,0.12)' }}
            >
              <div className="relative z-10 flex flex-col justify-center">
                <p className="label-caps mb-2">{t('insights.csatLabel')}</p>
                <div className="flex items-baseline gap-2">
                  <h3 className="text-6xl font-extrabold font-headline text-on-surface">
                    4.8
                  </h3>
                  <span className="text-xl font-bold text-muted-foreground/40">{t('insights.csatScale')}</span>
                </div>
                <div className="mt-4 flex items-center gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-success">
                    {t('insights.csatStatus')}
                  </span>
                  <div className="h-1.5 w-24 rounded-full overflow-hidden bg-muted/25">
                    <div className="h-full rounded-full" style={{ width: '85%', background: 'linear-gradient(to right, #10b981, #059669)' }} />
                  </div>
                </div>
              </div>
              <div className="relative z-10 ml-auto flex gap-1.5 items-end h-24">
                {[40, 60, 55, 80, 95].map((h, i) => (
                  <div
                    key={i}
                    className="w-3 rounded-t-sm"
                    style={{
                      height: `${h}%`,
                      background: i === 4 ? 'linear-gradient(to top, #2a4bd9, #8329c8)' : 'rgba(171,173,175,0.2)',
                    }}
                  />
                ))}
              </div>
            </motion.div>
          </motion.section>

          {/* Topics */}
          <section className="space-y-6">
            <motion.div
              className="flex justify-between items-end pb-4 border-b border-muted/15"
              variants={fadeUp}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
            >
              <div>
                <h4 className="text-xl font-bold font-headline text-on-surface">
                  {t('insights.topicHeading')}
                </h4>
                <p className="text-sm text-on-surface-variant">
                  {t('insights.topicDescription', { count: (insights?.totalResponses ?? 12482).toLocaleString() })}
                </p>
              </div>
              <motion.div whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={regenerate}
                  disabled={generating}
                  className="glass-card px-5 py-2 rounded-xl font-bold text-xs flex items-center gap-2 text-on-surface border border-muted/20 bg-background"
                >
                  <Icon name={generating ? 'hourglass_top' : 'refresh'} size={16}
                    style={{ animation: generating ? 'spin 1s linear infinite' : 'none' }} />
                  {generating ? t('common.regenerating') : t('insights.refreshButton')}
                </Button>
              </motion.div>
            </motion.div>

            <motion.div
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4"
              variants={stagger}
              initial="hidden"
              animate="visible"
            >
              {(insights?.topics || topics).map((topic, idx) => {
                const isRaw = !!topic.name;
                const title = isRaw ? topic.name : topic.title;
                const volume = isRaw ? `${topic.volume.toLocaleString()} VOL` : topic.volume;
                const isActive = isRaw ? topic.sentiment === 'negative' : topic.active;
                const iconName = isRaw ? TOPIC_ICONS[idx % TOPIC_ICONS.length] : topic.icon;
                const sigInfo = isRaw ? sentimentToSignal(topic.sentiment, t) : { signal: topic.signal, signalColor: topic.signalColor };
                const signalDot = isRaw ? (topic.sentiment === 'positive' ? '#10b981' : topic.sentiment === 'negative' ? '#b41340' : '#f59e0b') : topic.signalDot;
                return (
                  <motion.button
                    key={isRaw ? topic.name : topic.id}
                    custom={idx}
                    variants={fadeUp}
                    className="group p-5 rounded-2xl text-left relative overflow-hidden flex flex-col h-full"
                    style={{
                      background: isActive
                        ? 'linear-gradient(135deg, #2a4bd9, #8329c8)'
                        : 'rgba(255,255,255,0.75)',
                      backdropFilter: 'blur(16px)',
                      WebkitBackdropFilter: 'blur(16px)',
                      boxShadow: isActive
                        ? '0 12px 32px -8px rgba(42,75,217,0.4)'
                        : '0 4px 24px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.8)',
                      border: isActive ? 'none' : '1px solid rgba(255,255,255,0.6)',
                    }}
                    whileHover={{ y: -4, scale: 1.01 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {isActive && (
                      <div className="absolute inset-0 holographic rounded-2xl opacity-40 pointer-events-none" />
                    )}
                    <div className="flex justify-between items-start mb-6 relative">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center"
                        style={{
                          background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(42,75,217,0.08)',
                          color: isActive ? '#ffffff' : '#2a4bd9',
                        }}
                      >
                        <Icon name={iconName} size={20} />
                      </div>
                      <span
                        className="text-[9px] font-extrabold px-2 py-1 rounded-full"
                        style={{
                          color: isActive ? '#ffffff' : '#595c5e',
                          background: isActive ? 'rgba(255,255,255,0.2)' : 'rgba(171,173,175,0.2)',
                        }}
                      >
                        {volume}
                      </span>
                    </div>
                    <h5
                      className="font-bold text-base mb-1 relative font-headline"
                      style={{ color: isActive ? '#ffffff' : '#2c2f31' }}
                    >
                      {title}
                    </h5>
                    <div className="flex items-center gap-1.5 mt-auto relative">
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: isActive ? '#ffffff' : signalDot }}
                      />
                      <span
                        className="text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: isActive ? 'rgba(255,255,255,0.9)' : sigInfo.signalColor }}
                      >
                        {sigInfo.signal}
                      </span>
                    </div>
                  </motion.button>
                );
              })}
            </motion.div>
          </section>

          {/* Detail Analytics */}
          <motion.section
            className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            variants={stagger}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
          >
            <motion.div custom={0} variants={fadeUp} className="lg:col-span-2 space-y-6">
              <Card
                className="glass-card-premium rounded-2xl overflow-hidden border-white/60"
                style={{
                  boxShadow: '0 4px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
                }}
              >
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="border-b border-muted/15 bg-background/70">
                    <TabsList className="h-auto bg-transparent rounded-none p-0 gap-0">
                      {[
                        { id: 'analysis', label: t('insights.tabs.signalAnalysis'), icon: 'analytics' },
                        { id: 'raw', label: t('insights.tabs.rawData'), icon: 'chat_bubble_outline' },
                        { id: 'velocity', label: t('insights.tabs.velocity'), icon: 'trending_up' },
                      ].map((tab) => (
                        <TabsTrigger
                          key={tab.id}
                          value={tab.id}
                          className="px-8 py-4 font-bold text-xs tracking-wide flex items-center gap-2 rounded-none data-[state=active]:bg-white data-[state=active]:text-primary data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=inactive]:text-muted-foreground/60 border-b-2 border-transparent"
                        >
                          <Icon name={tab.icon} size={18} />
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <CardContent className="p-8 space-y-12">
                    <div className="flex flex-col md:flex-row gap-16">
                      {/* Sentiment bars */}
                      <div className="flex-1 space-y-6">
                        <h6 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground/50">
                          {t('insights.sentimentMap')}
                        </h6>
                        <div className="flex items-end justify-between h-48 gap-6">
                          {(() => {
                            const bd = insights?.sentimentBreakdown || SENTIMENT.DEFAULT;
                            return [
                              { pct: bd.positive, label: `${bd.positive}% POSITIVE`, color: '#10b981', textColor: '#059669' },
                              { pct: bd.neutral, label: `${bd.neutral}% NEUTRAL`, color: '#6b7280', textColor: '#4b5563' },
                              { pct: bd.negative, label: `${bd.negative}% FRICTION`, color: '#be123c', textColor: '#be123c' },
                            ];
                          })().map((bar) => (
                            <div key={bar.label} className="flex-1 flex flex-col items-center gap-4">
                              <div
                                className="w-full transition-all duration-1000"
                                style={{
                                  height: `${bar.pct}%`,
                                  background: `${bar.color}10`,
                                  borderTop: `2px solid ${bar.color}`,
                                }}
                              />
                              <span
                                className="text-[10px] font-bold"
                                style={{ color: bar.textColor }}
                              >
                                {bar.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Friction Points */}
                      <div className="flex-1 space-y-6">
                        <h6 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground/50">
                          {t('insights.frictionHeading')}
                        </h6>
                        <div className="space-y-3">
                          {(insights?.topPhrases || frictionPoints.map((f) => f.phrase)).map((phrase, i) => (
                            <motion.div
                              key={i}
                              className="flex justify-between items-center p-4 rounded-xl transition-all bg-background/80 border border-muted/15"
                              whileHover={{ borderColor: 'rgba(42,75,217,0.25)', x: 2 }}
                            >
                              <span className="text-sm font-semibold text-on-surface">
                                {typeof phrase === 'string' ? phrase : phrase.phrase}
                              </span>
                              <Badge variant="secondary" className="text-[10px] font-extrabold text-[#4338ca] bg-[rgba(67,56,202,0.1)]">
                                {typeof phrase === 'string' ? `${42 - i * 9}x` : phrase.count}
                              </Badge>
                            </motion.div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Sample Responses */}
                    <div className="space-y-6">
                      <h6 className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-muted-foreground/50">
                        {t('insights.samplesHeading')}
                      </h6>
                      <div className="space-y-4">
                        {sampleResponses.map((r) => (
                          <motion.div
                            key={r.id}
                            className="p-6 rounded-2xl"
                            style={{
                              background: 'rgba(255,255,255,0.75)',
                              backdropFilter: 'blur(12px)',
                              border: '1px solid rgba(255,255,255,0.6)',
                              boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                            }}
                            whileHover={{ y: -2 }}
                          >
                            <div className="flex justify-between items-center mb-3">
                              <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-primary bg-primary/8">
                                  R
                                </div>
                                <span className="text-[10px] font-bold text-on-surface-variant">
                                  {t('insights.participantLabel', { id: r.id })}
                                </span>
                              </div>
                              <span className="text-[10px] font-bold text-muted-foreground">
                                {r.time}
                              </span>
                            </div>
                            <p className="text-sm leading-relaxed text-on-surface-variant">
                              {r.text}
                            </p>
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Tabs>
              </Card>
            </motion.div>

            {/* Topic Management */}
            <motion.div custom={1} variants={fadeUp} className="lg:col-span-1">
              <Card
                className="glass-card-premium rounded-2xl p-8 flex flex-col h-full border-white/60"
                style={{
                  boxShadow: '0 4px 24px rgba(0,0,0,0.05), inset 0 1px 0 rgba(255,255,255,0.8)',
                }}
              >
                <div className="flex items-center gap-3 mb-8">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-gradient-primary text-white">
                    <Icon name="architecture" size={20} />
                  </div>
                  <h4 className="text-lg font-bold font-headline text-on-surface">
                    {t('insights.governanceHeading')}
                  </h4>
                </div>

                <div className="space-y-8 flex-1">
                  <div>
                    <p className="label-caps mb-4">
                      {t('insights.activeSelection')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <div className="px-3 py-1.5 text-[10px] font-bold flex items-center gap-2 rounded-full text-white"
                        style={{ background: 'linear-gradient(135deg, #2c2f31, #1a1f36)' }}>
                        Onboarding Velocity
                        <Button variant="ghost" size="icon" className="h-auto w-auto p-0 text-white/70 hover:text-white hover:bg-transparent">
                          <Icon name="close" size={14} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="label-caps">{t('insights.globalActions')}</p>
                    <div className="grid gap-2">
                      {[
                        { icon: 'merge', label: t('insights.globalActionConsolidate') },
                        { icon: 'edit_square', label: t('insights.globalActionRefine') },
                      ].map((a) => (
                        <motion.div key={a.label} whileHover={{ borderColor: 'rgba(42,75,217,0.3)', x: 2 }}>
                          <Button
                            variant="outline"
                            className="w-full text-left py-3 px-4 rounded-xl flex items-center gap-3 font-bold text-xs text-on-surface justify-start border-muted/20 bg-background/70"
                          >
                            <Icon name={a.icon} size={18} className="text-on-surface-variant" />
                            {a.label}
                          </Button>
                        </motion.div>
                      ))}
                      <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                        <Button
                          className="w-full py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 font-bold text-xs text-white mt-1 relative overflow-hidden bg-gradient-primary"
                          style={{ boxShadow: '0 8px 20px -6px rgba(42,75,217,0.4)' }}
                        >
                          <Icon name="account_tree" size={18} />
                          {t('insights.globalActionMapTheme')}
                        </Button>
                      </motion.div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-muted/15">
                    <p className="label-caps mb-4">{t('insights.recommendedThemes')}</p>
                    <div className="space-y-2">
                      {recommendedThemes.map((theme) => (
                        <motion.div
                          key={theme.label}
                          className="flex items-center justify-between p-3 rounded-xl cursor-pointer bg-background/70 border border-muted/10"
                          whileHover={{ x: 3, borderColor: 'rgba(42,75,217,0.2)' }}
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center"
                              style={{ background: theme.bg, color: theme.color }}
                            >
                              <Icon name={theme.icon} size={18} />
                            </div>
                            <span className="text-xs font-bold text-on-surface">
                              {theme.label}
                            </span>
                          </div>
                          <Icon name="arrow_forward" size={18} className="text-muted-foreground" />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-8 pt-6 border-t border-muted/15">
                  <p className="text-[9px] font-bold italic text-center text-muted-foreground">
                    {t('brand.poweredByCore')}
                  </p>
                </div>
              </Card>
            </motion.div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}
