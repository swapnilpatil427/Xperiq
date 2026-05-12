import { useState } from 'react';
import { SideNav } from '../components/SideNav';
import { BottomNav } from '../components/BottomNav';
import { Icon } from '../components/Icon';
import { useInsights } from '../hooks/useInsights';
import { useSurveys } from '../hooks/useSurveys';
import { useTranslation } from '../lib/i18n';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

const topicCards = [
  {
    id: 'ui',
    icon: 'dashboard',
    iconBg: '#eef2ff',
    iconColor: '#4f46e5',
    title: 'UI Usability',
    mentions: '342 Mentions',
    signal: 'Mostly Positive',
    signalColor: '#059669',
    dot: '#10b981',
    active: false,
    barColor: '#4f46e5',
  },
  {
    id: 'pricing',
    icon: 'payments',
    iconBg: '#fffbeb',
    iconColor: '#d97706',
    title: 'Pricing & Value',
    mentions: '1,204 Mentions',
    signal: 'Mixed',
    signalColor: '#d97706',
    dot: '#f59e0b',
    active: false,
    barColor: '#f59e0b',
  },
  {
    id: 'onboarding',
    icon: 'rocket_launch',
    iconBg: '#2a4bd9',
    iconColor: '#ffffff',
    title: 'Onboarding Experience',
    mentions: '892 Mentions',
    signal: 'Critical Issues',
    signalColor: '#b41340',
    dot: '#b41340',
    active: true,
    barColor: '#4f46e5',
  },
  {
    id: 'support',
    icon: 'support_agent',
    iconBg: '#f0fdfa',
    iconColor: '#0d9488',
    title: 'Customer Support',
    mentions: '215 Mentions',
    signal: 'Mostly Positive',
    signalColor: '#059669',
    dot: '#10b981',
    active: false,
    barColor: '#14b8a6',
  },
];

const sentimentBars = [
  { label: '15% Pos', pct: 15, color: 'linear-gradient(to top, #10b981, #6ee7b7)', labelColor: '#475569' },
  { label: '25% Neu', pct: 25, color: 'linear-gradient(to top, #94a3b8, #cbd5e1)', labelColor: '#475569' },
  { label: '60% Neg', pct: 60, color: 'linear-gradient(to top, #b41340, #f74b6d)', labelColor: '#b41340' },
];

const phrases = [
  { text: '"Too many steps to create project"', count: '42x' },
  { text: '"Confusing interface navigation"', count: '38x' },
  { text: '"Email verification loop"', count: '24x' },
];

const responses = [
  {
    id: '#1204',
    time: '2 days ago',
    stars: 2,
    text: '"I spent 15 minutes just trying to find where to upload my data. The onboarding tutorial skips over the most important part of project setup..."',
  },
  {
    id: '#883',
    time: '3 days ago',
    stars: 1,
    text: '"The onboarding is way too long. I just want to use the tool, not watch 5 minutes of videos before I can even click a button."',
  },
];

const themes = [
  { icon: 'stars', bg: '#f0fdf4', color: '#059669', label: 'Product Experience' },
  { icon: 'monetization_on', bg: '#fffbeb', color: '#d97706', label: 'Revenue & Value' },
];

export function AdvancedInsightsPage() {
  const [activeTab, setActiveTab] = useState('analysis');
  const { t } = useTranslation();
  const { surveys } = useSurveys();
  const activeSurvey = surveys.find((s) => s.status === 'active') || surveys[0];
  const { insights, generating, regenerate } = useInsights(activeSurvey?.id);

  return (
    <div className="flex min-h-screen bg-surface font-body">
      <SideNav />

      <main className="flex-1 flex flex-col min-h-screen md:ml-64">
        {/* Top Bar */}
        <header
          className="topbar-fixed fixed top-0 z-50 glass-nav flex justify-between items-center h-16 px-6"
          style={{
            boxShadow: '0 8px 32px 0 rgba(31,38,135,0.07)',
          }}
        >
          <div className="flex items-center gap-4">
            <h2 className="text-2xl font-bold tracking-tight font-headline text-on-surface">
              {t('advancedInsights.pageTitle')}
            </h2>
            <Separator orientation="vertical" className="h-6 opacity-50" />
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/30">
              <Icon name="calendar_today" size={16} className="text-primary" />
              <span className="text-xs font-semibold text-on-surface-variant">{t('advancedInsights.dateFilter')}</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {['notifications', 'help'].map((icon) => (
                <Button
                  key={icon}
                  variant="ghost"
                  size="icon"
                  className="w-10 h-10 rounded-full text-on-surface-variant hover:bg-muted/50"
                >
                  <Icon name={icon} size={20} />
                </Button>
              ))}
            </div>
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm text-white font-headline bg-gradient-primary border-2 border-white"
            >
              AR
            </div>
          </div>
        </header>

        <div className="pt-24 pb-12 px-6 space-y-8 max-w-7xl mx-auto w-full">

          {/* NPS + CSAT */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* NPS Gauge */}
            <div
              className="p-8 relative overflow-hidden text-white flex items-center gap-8"
              style={{
                background: 'linear-gradient(135deg, #4338ca, #3730a3)',
                borderRadius: '0.75rem',
                boxShadow: '0 20px 40px -10px rgba(67,56,202,0.4)',
              }}
            >
              <div className="relative z-10 flex flex-col justify-center">
                <p className="text-indigo-100 font-bold text-xs uppercase tracking-widest mb-1">
                  {t('insights.npsLabel')}
                </p>
                <h3 className="text-5xl font-black mb-4 font-headline">
                  74
                </h3>
                <div className="flex items-end gap-1 h-6">
                  <svg className="w-24 h-6" viewBox="0 0 100 25">
                    <path
                      className="sparkline-svg"
                      d="M0,20 Q10,5 20,18 T40,10 T60,22 T80,5 T100,15"
                      fill="none"
                      stroke="rgba(255,255,255,0.6)"
                      strokeWidth="2"
                    />
                  </svg>
                  <span className="text-[10px] font-bold text-emerald-300">+4 pts</span>
                </div>
              </div>
              <div className="relative z-10 ml-auto">
                <div className="relative w-32 h-32 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                    <circle
                      cx="64" cy="64" r="54"
                      fill="transparent"
                      stroke="rgba(67,56,202,0.4)"
                      strokeWidth="12"
                    />
                    <circle
                      cx="64" cy="64" r="54"
                      fill="transparent"
                      stroke="#82deff"
                      strokeWidth="12"
                      strokeDasharray="339.29"
                      strokeDashoffset="84.8"
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-black font-headline">74%</span>
                    <span className="text-[8px] uppercase font-bold tracking-tighter opacity-70">{t('insights.npsExcellent')}</span>
                  </div>
                </div>
              </div>
              <div
                className="absolute -right-10 -bottom-10 w-48 h-48 rounded-full"
                style={{ background: 'rgba(255,255,255,0.05)', filter: 'blur(48px)' }}
              />
            </div>

            {/* CSAT */}
            <Card
              className="p-8 relative overflow-hidden flex items-center gap-8 bg-white border-muted/10"
              style={{
                borderRadius: '0.75rem',
                boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
              }}
            >
              <div className="relative z-10 flex flex-col justify-center">
                <p className="font-bold text-xs uppercase tracking-widest mb-1 text-on-surface-variant">
                  {t('insights.csatLabel')}
                </p>
                <div className="flex items-baseline gap-2 mb-4">
                  <h3 className="text-5xl font-black font-headline text-on-surface">
                    4.8
                  </h3>
                  <span className="text-xl font-bold text-muted-foreground/50">{t('insights.csatScale')}</span>
                </div>
                <div className="flex items-end gap-1 h-6">
                  <svg className="w-24 h-6" viewBox="0 0 100 25">
                    <path
                      className="sparkline-svg"
                      d="M0,15 Q20,10 40,5 T60,8 T80,3 T100,5"
                      fill="none"
                      stroke="#2a4bd9"
                      strokeWidth="2"
                    />
                  </svg>
                  <span className="text-[10px] font-bold text-success">+0.2</span>
                </div>
              </div>

              {/* Bar viz */}
              <div className="relative z-10 ml-auto flex gap-2 items-end h-24">
                {[
                  { h: 50, bg: '#f1f5f9' },
                  { h: 65, bg: '#f1f5f9' },
                  { h: 75, bg: '#94a3b8' },
                  { h: 88, bg: '#818cf8' },
                  { h: 96, bg: '#4f46e5', glow: true },
                ].map((bar, i) => (
                  <div
                    key={i}
                    className="w-4 rounded-full relative overflow-hidden self-end"
                    style={{
                      height: `${bar.h}%`,
                      background: bar.bg,
                      boxShadow: bar.glow ? '0 0 12px rgba(79,70,229,0.4)' : 'none',
                    }}
                  />
                ))}
              </div>
            </Card>
          </section>

          {/* Topics */}
          <section className="space-y-4">
            <div className="flex justify-between items-end">
              <div>
                <h4 className="text-xl font-bold font-headline text-on-surface">
                  {t('advancedInsights.extractedTopics')}
                </h4>
                <p className="text-sm text-on-surface-variant">
                  {t('advancedInsights.topicsDescription', { count: (insights?.totalResponses ?? 12482).toLocaleString() })}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full border-border text-on-surface bg-white hover:bg-muted/10 font-bold"
              >
                <Icon name="settings_suggest" size={16} />
                {t('advancedInsights.recalculateButton')}
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {topicCards.map((card) => (
                <button
                  key={card.id}
                  className="group p-5 text-left relative overflow-hidden transition-all duration-300"
                  style={{
                    background: card.active ? '#e0e7ff' : '#ffffff',
                    border: card.active ? '2px solid #4f46e5' : '1px solid rgba(171,173,175,0.1)',
                    borderRadius: '1rem',
                    boxShadow: card.active ? '0 8px 24px rgba(79,70,229,0.2)' : '0 2px 8px rgba(0,0,0,0.04)',
                    transform: card.active ? 'scale(1.05)' : 'none',
                    zIndex: card.active ? 10 : 'auto',
                  }}
                  onMouseEnter={(e) => {
                    if (!card.active) {
                      e.currentTarget.style.boxShadow = '0 20px 40px -10px rgba(0,0,0,0.1)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!card.active) {
                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)';
                    }
                  }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center"
                      style={{ background: card.iconBg, color: card.iconColor }}
                    >
                      <Icon name={card.icon} size={20} />
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-[10px] font-bold uppercase px-2 py-1 rounded-xl"
                      style={{
                        background: card.active ? '#4f46e5' : '#f1f5f9',
                        color: card.active ? '#ffffff' : '#475569',
                      }}
                    >
                      {card.mentions}
                    </Badge>
                  </div>
                  <h5 className="font-bold mb-1 font-headline text-on-surface">
                    {card.title}
                  </h5>
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ background: card.dot, animation: card.active ? 'pulse 2s infinite' : 'none' }}
                    />
                    <span
                      className="text-xs font-semibold uppercase tracking-tighter"
                      style={{ color: card.signalColor }}
                    >
                      {card.signal}
                    </span>
                  </div>

                  {/* Hover bar */}
                  <div
                    className="absolute bottom-0 left-0 h-1 w-0 group-hover:w-full transition-all duration-500"
                    style={{ background: card.barColor }}
                  />
                </button>
              ))}
            </div>
          </section>

          {/* Analytics Detail */}
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">
              <Card
                className="overflow-hidden bg-white border-muted/10"
                style={{
                  borderRadius: '1rem',
                  boxShadow: '0 4px 12px rgba(0,0,0,0.04)',
                }}
              >
                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab}>
                  <div className="border-b border-muted/20 bg-muted/5 p-2 flex gap-2">
                    <TabsList className="h-auto bg-transparent rounded-none p-0 gap-2">
                      {[
                        { id: 'analysis', label: t('advancedInsights.tabs.analysis'), icon: 'analytics' },
                        { id: 'sample', label: t('advancedInsights.tabs.sampleData'), icon: 'chat_bubble' },
                        { id: 'trends', label: t('advancedInsights.tabs.trends'), icon: 'history' },
                      ].map((tab) => (
                        <TabsTrigger
                          key={tab.id}
                          value={tab.id}
                          className="px-6 py-3 rounded-xl font-bold text-sm flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-[#4f46e5] data-[state=active]:shadow-sm data-[state=inactive]:text-muted-foreground"
                        >
                          <Icon name={tab.icon} size={16} />
                          {tab.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </div>

                  <CardContent className="p-8 space-y-10">
                    <div className="flex flex-col md:flex-row gap-12">
                      {/* Sentiment */}
                      <div className="flex-1 space-y-4">
                        <h6 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                          {t('advancedInsights.sentimentBreakdown')}
                        </h6>
                        <div className="flex items-end justify-between h-40 gap-4">
                          {sentimentBars.map((bar) => (
                            <div key={bar.label} className="flex-1 flex flex-col items-center gap-3">
                              <div
                                className="w-full rounded-t-xl soft-extrusion"
                                style={{ height: `${bar.pct}%`, background: bar.color }}
                              />
                              <span
                                className="text-[10px] font-bold"
                                style={{ color: bar.labelColor }}
                              >
                                {bar.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Phrases */}
                      <div className="flex-1 space-y-4">
                        <h6 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                          {t('advancedInsights.topPhrases')}
                        </h6>
                        <div className="space-y-3">
                          {phrases.map((p) => (
                            <div
                              key={p.text}
                              className="flex justify-between items-center p-3 rounded-xl border bg-muted/5 border-muted/20"
                            >
                              <span className="text-sm font-semibold text-on-surface">{p.text}</span>
                              <Badge
                                variant="secondary"
                                className="text-xs font-bold px-2 py-0.5 rounded-xl"
                                style={{ color: '#4f46e5', background: '#eef2ff' }}
                              >
                                {p.count}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Responses */}
                    <div className="space-y-4">
                      <h6 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
                        {t('advancedInsights.sampleResponses')}
                      </h6>
                      <ScrollArea className="h-64 pr-2">
                        <div className="space-y-4">
                          {responses.map((r) => (
                            <Card
                              key={r.id}
                              className="p-4 border-muted/20 bg-white"
                              style={{ boxShadow: '0 2px 6px rgba(0,0,0,0.04)' }}
                            >
                              <div className="flex justify-between mb-2">
                                <span className="text-xs font-bold text-muted-foreground">
                                  {t('advancedInsights.respondentLabel', { id: r.id, time: r.time })}
                                </span>
                                <span className="flex gap-0.5 text-amber-400">
                                  {Array.from({ length: r.stars }, (_, i) => (
                                    <Icon key={i} name="star" fill={1} size={12} />
                                  ))}
                                </span>
                              </div>
                              <p className="text-sm italic leading-relaxed text-on-surface-variant">
                                {r.text}
                              </p>
                            </Card>
                          ))}
                        </div>
                      </ScrollArea>
                    </div>
                  </CardContent>
                </Tabs>
              </Card>
            </div>

            {/* Topic Management */}
            <div className="lg:col-span-1 space-y-6">
              <Card
                className="rounded-2xl border p-8 h-full flex flex-col"
                style={{
                  background: 'rgba(255,255,255,0.6)',
                  backdropFilter: 'blur(24px)',
                  borderColor: 'rgba(255,255,255,0.4)',
                  boxShadow: '0 20px 40px -10px rgba(0,0,0,0.08)',
                }}
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-primary bg-primary/10">
                    <Icon name="manage_accounts" size={20} />
                  </div>
                  <h4 className="text-lg font-black font-headline text-on-surface">
                    {t('advancedInsights.topicManagement')}
                  </h4>
                </div>

                <div className="space-y-6 flex-1">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest mb-3 text-muted-foreground">
                      {t('advancedInsights.activeSelection')}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <div
                        className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-2 text-white"
                        style={{
                          background: '#4f46e5',
                          boxShadow: '0 4px 12px rgba(79,70,229,0.2)',
                        }}
                      >
                        Onboarding Experience
                        <Button variant="ghost" size="icon" className="h-auto w-auto p-0 text-white/80 hover:text-white hover:bg-transparent">
                          <Icon name="close" size={12} />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                      {t('advancedInsights.globalActions')}
                    </p>
                    <div className="grid gap-3">
                      {[
                        { icon: 'merge', label: t('advancedInsights.globalActionMerge') },
                        { icon: 'edit', label: t('advancedInsights.globalActionRename') },
                      ].map((a) => (
                        <Button
                          key={a.label}
                          variant="outline"
                          className="w-full vr-button border py-3 px-4 rounded-xl flex items-center gap-3 font-bold text-sm bg-white justify-start border-border text-foreground"
                        >
                          <Icon name={a.icon} size={18} style={{ color: '#4f46e5' }} />
                          {a.label}
                        </Button>
                      ))}
                      <Button
                        className="w-full vr-button py-4 px-4 rounded-xl flex items-center justify-center gap-3 font-bold text-sm text-white"
                        style={{
                          background: '#4f46e5',
                          boxShadow: '0 10px 20px rgba(79,70,229,0.2)',
                        }}
                      >
                        <Icon name="folder_shared" size={18} />
                        {t('advancedInsights.globalActionGroup')}
                      </Button>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-muted/50">
                    <p className="text-xs font-bold uppercase tracking-widest mb-4 text-muted-foreground">
                      {t('advancedInsights.recommendedThemes')}
                    </p>
                    <div className="space-y-3">
                      {themes.map((theme) => (
                        <div
                          key={theme.label}
                          className="flex items-center justify-between p-3 rounded-xl cursor-pointer transition-colors group bg-muted/50 hover:bg-muted"
                        >
                          <div className="flex items-center gap-3">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center"
                              style={{ background: theme.bg, color: theme.color }}
                            >
                              <Icon name={theme.icon} size={16} />
                            </div>
                            <span className="text-sm font-bold text-on-surface">{theme.label}</span>
                          </div>
                          <Icon
                            name="chevron_right"
                            size={18}
                            className="group-hover:translate-x-1 transition-transform text-muted-foreground"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </Card>
            </div>
          </section>
        </div>
      </main>

      <BottomNav />
    </div>
  );
}
