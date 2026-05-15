// UnifiedInsightsView — "Crystal Command" — the single unified Insights experience.
//
// Architecture: dark cinematic hero (crystal + ask) → editorial brief →
// metrics → deeper findings bento → live crystal conversation → auto-surfaced.
// Scroll is the journey; the crystal is the constant thread.
//
// Engineering alignment vs docs/insights/ARCHITECTURE.md:
//   • Crystal: CSS-only (client-side), no Three.js weight on this page
//   • Brief: representative data until /api/insights/aggregate ships (v1.1)
//   • Conversation: static demo Q&A — wires to /api/insights/ask (NLQ endpoint)
//   • Contributing surveys strip: meta.cross_survey category (backend v1.1)
//   • All citations use the [rXXX] format from INSIGHT_TAXONOMY.md

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import type { Insight, Survey } from '../../types';
import type { SurveyScope } from '../../components/SurveyScopePicker';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { ROUTES } from '../../constants/routes';
import {
  GlassCard,
  CitationChip,
  ConfidenceChip,
  CIBar,
  LayerBadge,
  LiveDot,
} from './shared';

// ── Animation variants ────────────────────────────────────────────────────
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};
const rise = {
  hidden: { opacity: 0, y: 18 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] },
  },
};

// ── Types ─────────────────────────────────────────────────────────────────
interface ViewProps {
  insights: Insight | null;
  scope: SurveyScope;
  surveys: Survey[];
}

// ─────────────────────────────────────────────────────────────────────────────
export function UnifiedInsightsView({ insights, scope, surveys }: ViewProps) {
  const isAll = scope === 'all';
  const { openCrystal } = useCrystalPanel();
  const [askQuery, setAskQuery] = useState('');
  const nps = insights?.nps_score ?? 47;
  const activeSurveys = surveys.filter((s) => s.status === 'active' && !s.deleted_at);
  const activeCount = activeSurveys.length;
  const totalResponses = surveys.reduce((sum, s) => sum + (s.response_count ?? 0), 0);
  const leadSurvey = activeSurveys[0];
  const displayNps = isAll ? 51 : nps;

  return (
    <div className="space-y-12">

      {/* ════════════════════════════════════════════════════════════════════
          § 1  CRYSTAL HERO — dark cinematic section (full-bleed)
          Crystal centerpiece, ask bar, suggested prompts, live badge.
      ════════════════════════════════════════════════════════════════════ */}
      <motion.section
        variants={stagger}
        initial="hidden"
        animate="visible"
        className="relative -mx-6 md:-mx-8 overflow-hidden rounded-3xl"
        style={{
          background:
            'radial-gradient(ellipse at 25% 0%, rgba(42,75,217,0.45) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 75% 20%, rgba(131,41,200,0.35) 0%, transparent 55%),' +
            'radial-gradient(ellipse at 50% 100%, rgba(0,100,124,0.25) 0%, transparent 60%),' +
            'linear-gradient(180deg, #07091F 0%, #0F0822 60%, #070920 100%)',
        }}
      >
        {/* Top vignette */}
        <div
          className="absolute inset-x-0 top-0 h-28 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(7,9,31,0.6), transparent)' }}
        />

        <div className="relative z-10 px-8 md:px-16 pt-16 pb-14 text-white text-center">
          {/* Live badge */}
          <motion.div variants={rise} className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-bold"
              style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
              <LiveDot color="#34d399" />
              <span className="text-emerald-300">
                {isAll
                  ? `${activeCount} surveys live · ${totalResponses.toLocaleString()} responses`
                  : 'Live · 3 new insights in last 60s'}
              </span>
            </div>
          </motion.div>

          {/* Crystal */}
          <motion.div variants={rise} className="flex justify-center mb-2 relative">
            {/* Glow pedestal */}
            <div
              className="absolute bottom-0 left-1/2 -translate-x-1/2 pointer-events-none"
              style={{
                width: 200,
                height: 60,
                background: 'radial-gradient(ellipse, rgba(131,41,200,0.5), transparent 70%)',
                filter: 'blur(16px)',
                bottom: -20,
              }}
            />
            <Crystal />
          </motion.div>

          <motion.div variants={rise}>
            <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300/80 mb-3 mt-6">
              Crystal · Experience Intelligence
            </div>
            <h2 className="font-headline font-black text-2xl md:text-3xl tracking-tight text-white mb-2">
              {isAll
                ? `Ask anything across ${activeCount} surveys`
                : 'Ask anything about this survey'}
            </h2>
            <p className="text-sm text-white/60 mb-8 max-w-md mx-auto">
              Every answer cites real customer quotes. Numbers come from analytics tools, not the LLM.
            </p>
          </motion.div>

          {/* Ask bar */}
          <motion.div variants={rise} className="max-w-2xl mx-auto mb-5">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (askQuery.trim()) {
                  openCrystal(askQuery.trim());
                  setAskQuery('');
                }
              }}
              className="flex items-center gap-2 p-2 rounded-2xl"
              style={{
                background: 'rgba(255,255,255,0.07)',
                backdropFilter: 'blur(24px) saturate(180%)',
                WebkitBackdropFilter: 'blur(24px) saturate(180%)',
                border: '1px solid rgba(255,255,255,0.14)',
              }}
            >
              <button
                type="button"
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 hover:bg-white/10 transition-colors"
              >
                <Icon name="mic" size={20} style={{ color: 'rgba(255,255,255,0.7)' }} />
              </button>
              <input
                type="text"
                value={askQuery}
                onChange={(e) => setAskQuery(e.target.value)}
                placeholder={
                  isAll
                    ? '"Which survey has the highest churn risk?"'
                    : '"Why did NPS dip on May 10?"'
                }
                className="flex-1 px-3 py-2.5 bg-transparent focus:outline-none text-sm text-white placeholder:text-white/40"
              />
              <Button
                type="submit"
                size="sm"
                className="flex-shrink-0 text-xs font-bold text-white border-0 shadow-lg"
                style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
              >
                <Icon name="arrow_upward" size={15} />
                Ask Crystal
              </Button>
            </form>
          </motion.div>

          {/* Suggested prompts */}
          <motion.div variants={rise} className="flex flex-wrap justify-center gap-2">
            {isAll ? (
              <>
                <DarkPromptChip icon="compare" label="Which survey has highest churn risk?" onClick={() => openCrystal('Which survey has highest churn risk?')} />
                <DarkPromptChip icon="trending_up" label="Themes appearing in 3+ surveys" onClick={() => openCrystal('Themes appearing in 3+ surveys')} />
                <DarkPromptChip icon="balance" label="Over-sampled segments?" onClick={() => openCrystal('Are surveys over-sampling one segment?')} />
                <DarkPromptChip icon="lightbulb" label="Top portfolio action?" onClick={() => openCrystal('Top portfolio action right now?')} />
              </>
            ) : (
              <>
                <DarkPromptChip icon="trending_down" label="Why did NPS drop May 10?" onClick={() => openCrystal('Why did NPS drop May 10?')} />
                <DarkPromptChip icon="warning" label="Highest churn-risk segment?" onClick={() => openCrystal('Highest churn-risk segment?')} />
                <DarkPromptChip icon="lightbulb" label="What would raise CSAT most?" onClick={() => openCrystal('What would raise CSAT most?')} />
                <DarkPromptChip icon="compare" label="Compare to last quarter" onClick={() => openCrystal('Compare to last quarter')} />
              </>
            )}
          </motion.div>
        </div>
      </motion.section>

      {/* ════════════════════════════════════════════════════════════════════
          § 2  PORTFOLIO BRIEF — editorial narrative
      ════════════════════════════════════════════════════════════════════ */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="space-y-6"
      >
        <SectionLabel icon="menu_book" label="Recent briefs" explorePath={ROUTES.INSIGHTS_BRIEF} />

        {/* Orb + headline */}
        <motion.div variants={rise} className="flex items-start gap-6">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center flex-shrink-0 holographic"
            style={{
              background: 'linear-gradient(135deg, #2a4bd9, #8329c8)',
              boxShadow: '0 10px 30px -10px rgba(42,75,217,0.35)',
              animation: 'float-bob 6s ease-in-out infinite',
            }}
          >
            <Icon name={isAll ? 'dataset' : 'diamond'} size={38} style={{ color: 'white' }} />
          </div>
          <div className="pt-1 flex-1">
            <div className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary mb-2">
              {isAll
                ? `Portfolio brief · ${activeCount} active surveys · generated 12s ago`
                : 'Recent brief · generated 12s ago'}
            </div>
            <h1 className="text-3xl md:text-4xl font-black font-headline tracking-tight leading-[1.15]">
              {isAll ? (
                <>
                  <span className="text-gradient">"Pricing transparency"</span> appears as
                  a top theme in 4 of your {activeCount} surveys; portfolio NPS holds at 51.
                </>
              ) : (
                <>
                  NPS held steady at {displayNps} with a recovered 12-point dip;{' '}
                  <span className="text-gradient">support response time</span> is the #1 driver.
                </>
              )}
            </h1>
          </div>
        </motion.div>

        {/* Narrative paragraph */}
        <motion.div variants={rise}>
          <GlassCard className="p-7">
            {isAll ? (
              <p className="text-base leading-relaxed font-medium text-on-surface">
                Across your <strong>{activeCount} active surveys</strong> (
                <strong>{totalResponses.toLocaleString()} total responses</strong>), portfolio NPS
                sits at <strong>51 ±3</strong>
                <CitationChip id="agg.nps" /><CitationChip id="agg.csat" />.
                The most recurring topic is <strong>"pricing transparency"</strong>, surfacing in{' '}
                <strong>4 surveys</strong>
                {leadSurvey ? <> including <em>{leadSurvey.title}</em></> : null}{' '}
                <CitationChip id="r1188" /><CitationChip id="r2104" /><CitationChip id="r3401" />.
                The single highest-impact portfolio action:{' '}
                <strong>fix the email verification loop</strong> — projected to lift portfolio NPS
                by <strong>+1.4 ±0.7</strong>
                <CitationChip id="r1234" /><CitationChip id="r1492" />.
              </p>
            ) : (
              <p className="text-base leading-relaxed font-medium text-on-surface">
                NPS held steady at <strong>{displayNps}</strong>
                <CitationChip id="r1102" /><CitationChip id="r1188" />
                {' '}with a brief 12-point dip on May 10
                <CitationChip id="r2104" /><CitationChip id="r2107" />
                {' '}now recovered. The dominant driver of detractor sentiment remains{' '}
                <strong>support response time</strong>, which moved from 4th to 1st in the last 30
                days
                <CitationChip id="r983" /><CitationChip id="r1234" />.{' '}
                The single highest-leverage action this week is{' '}
                <strong>fixing the email verification loop</strong> — cited by 18 respondents,
                projected to raise NPS by <strong>+3.2 ±1.8</strong>
                <CitationChip id="r1188" /><CitationChip id="r1234" /><CitationChip id="r1492" />.
              </p>
            )}
            <div className="flex items-center gap-3 mt-5 pt-5 border-t border-outline-variant/30">
              <div className="text-xs">
                <span className="font-bold">Confidence 89</span>
                <span className="text-on-surface-variant"> · 9 cited responses · n=312</span>
              </div>
              <div className="flex-1" />
              <Button variant="outline" size="sm" className="text-xs">
                <Icon name="ios_share" size={14} /> Send to Slack
              </Button>
              <Button variant="outline" size="sm" className="text-xs">
                <Icon name="picture_as_pdf" size={14} /> Export brief
              </Button>
            </div>
          </GlassCard>
        </motion.div>

        {/* Contributing surveys strip — isAll only */}
        {isAll && activeSurveys.length > 0 && (
          <motion.div variants={rise}>
            <div className="flex items-center gap-2 mb-3">
              <Icon name="dataset" size={15} className="text-on-surface-variant" />
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                Contributing surveys
              </span>
              <span className="text-[10px] text-on-surface-variant/60">
                {activeCount} active · {totalResponses.toLocaleString()} responses
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeSurveys.slice(0, 8).map((s) => (
                <button
                  key={s.id}
                  className="px-3 py-1.5 rounded-full bg-card border border-border/40 hover:border-primary/40 transition-colors flex items-center gap-2 text-xs"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  <span className="font-bold truncate max-w-[180px]">
                    {s.title || 'Untitled survey'}
                  </span>
                  <span className="font-mono text-on-surface-variant text-[10px]">
                    {(s.response_count ?? 0).toLocaleString()}
                  </span>
                </button>
              ))}
              {activeSurveys.length > 8 && (
                <button className="px-3 py-1.5 rounded-full text-xs font-bold text-primary hover:bg-primary/10 transition-colors">
                  +{activeSurveys.length - 8} more
                </button>
              )}
            </div>
          </motion.div>
        )}
      </motion.section>

      {/* ════════════════════════════════════════════════════════════════════
          § 3  LIVE METRICS — NPS · CSAT · Top action
      ════════════════════════════════════════════════════════════════════ */}
      <motion.section
        variants={stagger}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        className="space-y-4"
      >
        <SectionLabel icon="monitoring" label="Live metrics" explorePath={ROUTES.INSIGHTS_METRICS} />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* NPS */}
          <motion.div variants={rise}>
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  {isAll ? 'Portfolio NPS' : 'NPS'}
                </span>
                <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-1">
                  <Icon name="trending_up" size={13} /> +2 / 7d
                </span>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-black font-headline">{displayNps}</span>
                <span className="text-on-surface-variant text-sm">
                  ±{isAll ? 3 : 5} · n={isAll ? totalResponses.toLocaleString() : '312'}
                </span>
              </div>
              <CIBar position={46} width={120} />
              <svg viewBox="0 0 200 40" className="w-full h-10 mt-3">
                <path
                  d="M0,30 L20,25 L40,28 L60,18 L80,22 L100,15 L120,20 L140,12 L160,18 L180,22 L200,15"
                  stroke="#2a4bd9"
                  strokeWidth="2"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
            </GlassCard>
          </motion.div>

          {/* CSAT */}
          <motion.div variants={rise}>
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  CSAT
                </span>
                <span className="text-[10px] font-bold text-on-surface-variant">stable</span>
              </div>
              <div className="flex items-baseline gap-2 mb-2">
                <span className="text-5xl font-black font-headline">4.2</span>
                <span className="text-on-surface-variant text-sm">/ 5 · ±0.2</span>
              </div>
              <CIBar position={84} width={120} />
              <div className="flex items-end gap-1.5 h-10 mt-3">
                {[25, 38, 55, 78, 92].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t-sm"
                    style={{
                      height: `${h}%`,
                      background:
                        i === 4
                          ? 'linear-gradient(to top, #00647c, #2a4bd9)'
                          : `rgba(0,100,124,${0.3 + i * 0.15})`,
                    }}
                  />
                ))}
              </div>
            </GlassCard>
          </motion.div>

          {/* Top action */}
          <motion.div variants={rise}>
            <div
              className="rounded-2xl p-6 holographic text-white relative overflow-hidden h-full"
              style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
            >
              <div className="flex items-center justify-between mb-3 relative z-10">
                <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
                  Top action · Prescriptive
                </span>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-bold">
                  CONF 89
                </span>
              </div>
              <h3 className="text-xl font-black font-headline leading-tight mb-2 relative z-10">
                Fix "email verification loop"
              </h3>
              <p className="text-sm opacity-90 mb-4 relative z-10">
                Projected NPS <strong>+3.2 ±1.8</strong> · 18 cited respondents.
              </p>
              <div className="flex items-center gap-2 relative z-10">
                <Button
                  size="sm"
                  className="bg-white text-primary hover:bg-white/90 text-xs font-bold"
                >
                  <Icon name="flag" size={14} /> Create ticket
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="bg-white/10 text-white hover:bg-white/20 text-xs font-bold"
                >
                  <Icon name="format_quote" size={14} /> 24 quotes
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      </motion.section>

      {/* ════════════════════════════════════════════════════════════════════
          § 4  DEEPER FINDINGS — bento grid
      ════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex items-center gap-4">
          <SectionLabel icon="science" label="Deeper findings" explorePath={ROUTES.INSIGHTS_FINDINGS} />
          <div className="flex items-center gap-1 text-xs ml-auto">
            <button className="px-2.5 py-1 rounded-full bg-primary/10 text-primary font-bold">All</button>
            <button className="px-2.5 py-1 rounded-full text-on-surface-variant hover:bg-muted transition-colors">Drivers</button>
            <button className="px-2.5 py-1 rounded-full text-on-surface-variant hover:bg-muted transition-colors">Voice</button>
            <button className="px-2.5 py-1 rounded-full text-on-surface-variant hover:bg-muted transition-colors">Anomalies</button>
            <button className="px-2.5 py-1 rounded-full text-on-surface-variant hover:bg-muted transition-colors">Predictive</button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Driver (wide) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="lg:col-span-7"
          >
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <LayerBadge layer="diagnostic" icon="local_fire_department" />
                  {isAll && leadSurvey && (
                    <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      {leadSurvey.title}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ConfidenceChip value={89} />
                  <span className="text-[10px] text-on-surface-variant font-bold">n=189</span>
                </div>
              </div>
              <h3 className="text-xl font-black font-headline leading-tight mb-3">
                {isAll
                  ? 'Cross-survey: "pricing transparency" recurs in 4 of 7 surveys'
                  : '"Support response time" is the #1 driver of NPS'}
              </h3>
              <p className="text-sm leading-relaxed mb-4">
                Its importance jumped from <strong>4th to 1st</strong> position in the last 30 days
                <CitationChip id="r983" /><CitationChip id="r1234" /><CitationChip id="r1492" />.
                Detractors mention support delay in 47% of cases.
              </p>
              <div className="space-y-2 mb-4">
                {([
                  { label: 'Support response time', impact: 0.31, w: 78, primary: true },
                  { label: 'Onboarding speed', impact: 0.22, w: 55, primary: false },
                  { label: 'Pricing transparency', impact: 0.15, w: 38, primary: false },
                  { label: 'Mobile reliability', impact: 0.10, w: 24, primary: false },
                ] as const).map((d) => (
                  <div key={d.label} className="flex items-center gap-3">
                    <span
                      className={`text-xs font-bold w-44 truncate ${d.primary ? '' : 'text-on-surface-variant'}`}
                    >
                      {d.label}
                    </span>
                    <div className="flex-1 h-3 rounded-full bg-muted relative">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full"
                        style={{
                          width: `${d.w}%`,
                          background: d.primary
                            ? 'linear-gradient(to right, #2a4bd9, #8329c8)'
                            : `rgba(42,75,217,${0.25 + d.w * 0.005})`,
                        }}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-on-surface-variant w-8 text-right">
                      {d.impact.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-4 border-t border-outline-variant/20">
                <Button size="sm" className="text-xs">
                  <Icon name="format_quote" size={14} /> 8 quotes
                </Button>
                <Button size="sm" variant="outline" className="text-xs">
                  <Icon name="help" size={14} /> Why this insight?
                </Button>
                <div className="flex-1" />
                <Button size="icon" variant="ghost" className="w-8 h-8">
                  <Icon name="thumb_up" size={15} />
                </Button>
                <Button size="icon" variant="ghost" className="w-8 h-8">
                  <Icon name="push_pin" size={15} />
                </Button>
              </div>
            </GlassCard>
          </motion.div>

          {/* Anomaly */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="lg:col-span-5"
          >
            <GlassCard className="p-6" style={{ borderLeft: '4px solid #d97706' }}>
              <div className="flex items-center justify-between mb-4">
                <LayerBadge layer="predictive" icon="warning" />
                <ConfidenceChip value={92} />
              </div>
              <h3 className="text-lg font-black font-headline leading-tight mb-3">
                NPS dropped 12 points on May 10
              </h3>
              <p className="text-sm leading-relaxed mb-4">
                Outside the 95% prediction interval. Linked to a "login error" spike in the same
                24h window
                <CitationChip id="r2104" /><CitationChip id="r2111" /><CitationChip id="r2114" />.
              </p>
              <div className="rounded-xl p-3 mb-4 bg-muted/50">
                <div className="flex items-end justify-between gap-1 h-16">
                  {[62, 65, 58, 25, 35, 54, 60].map((h, i) => (
                    <div
                      key={i}
                      className="flex-1 rounded-t"
                      style={{
                        height: `${h}%`,
                        background:
                          i === 3 ? '#d97706' : i === 4 ? 'rgba(217,119,6,0.6)' : 'rgba(42,75,217,0.6)',
                      }}
                    />
                  ))}
                </div>
                <div className="flex items-center justify-between mt-1 text-[9px] text-on-surface-variant font-bold">
                  <span>May 7</span><span>May 10</span><span>May 13</span>
                </div>
              </div>
              <Button size="sm" variant="outline" className="w-full text-xs">
                <Icon name="timeline" size={14} /> See the 14 responses
              </Button>
            </GlassCard>
          </motion.div>

          {/* Voice topic */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.12, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="lg:col-span-5"
          >
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <LayerBadge layer="diagnostic" icon="forum" />
                <ConfidenceChip value={76} />
              </div>
              <h3 className="text-lg font-black font-headline leading-tight mb-3">
                "Onboarding friction" — 102 mentions
              </h3>
              <div className="space-y-2 mb-3 text-xs">
                {[
                  { name: 'Email verification loop', count: 24, neg: 92 },
                  { name: 'Password reset confusion', count: 18, neg: 78 },
                  { name: 'Profile setup steps', count: 12, neg: 52 },
                ].map((t) => (
                  <div key={t.name} className="flex items-center gap-2">
                    <div className="flex-1 flex items-center gap-2">
                      <span className="font-bold">{t.name}</span>
                      <span className="text-on-surface-variant">{t.count}</span>
                    </div>
                    <span
                      className={
                        'px-1.5 py-0.5 rounded text-[9px] font-bold ' +
                        (t.neg >= 75 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700')
                      }
                    >
                      {t.neg}% NEG
                    </span>
                  </div>
                ))}
              </div>
              <div className="rounded-xl p-3 mb-3 bg-muted/50">
                <p className="text-xs italic">
                  "I spent 15 minutes in the verification loop, then gave up."
                </p>
                <p className="text-[10px] text-on-surface-variant mt-1">— r1188 · NPS 2 · frustration</p>
              </div>
              <Button size="sm" variant="outline" className="w-full text-xs text-secondary">
                Explore all 102 quotes →
              </Button>
            </GlassCard>
          </motion.div>

          {/* Predictive forecast */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.18, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
            className="lg:col-span-7"
          >
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <LayerBadge layer="predictive" icon="insights" />
                <ConfidenceChip value={81} />
              </div>
              <h3 className="text-lg font-black font-headline leading-tight mb-3">
                Projected NPS at 500 responses:{' '}
                <span className="text-primary">51 ±4</span> by Friday
              </h3>
              <p className="text-sm leading-relaxed mb-4">
                Based on velocity and sentiment trend, NPS is forecast to rise as Promoters
                disproportionately complete in late waves
                <CitationChip id="r2401" /><CitationChip id="r2415" />.
              </p>
              <svg viewBox="0 0 600 100" className="w-full">
                <defs>
                  <linearGradient id="ufForecastFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#879aff" />
                    <stop offset="1" stopColor="#879aff" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <path
                  d="M0,75 L60,60 L120,65 L180,50 L240,55 L300,45 L360,42"
                  stroke="#2a4bd9"
                  strokeWidth="2.5"
                  fill="none"
                />
                <path
                  d="M360,42 L420,38 L480,32 L540,28 L600,26 L600,46 L540,50 L480,54 L420,58 L360,42 Z"
                  fill="url(#ufForecastFill)"
                  opacity="0.6"
                />
                <path
                  d="M360,42 L420,38 L480,32 L540,28 L600,26"
                  stroke="#8329c8"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                  fill="none"
                />
                <line x1="360" y1="0" x2="360" y2="100" stroke="#abadaf" strokeDasharray="2 4" />
                <text x="368" y="14" fontSize="9" fill="#595c5e" fontWeight="700">
                  NOW
                </text>
              </svg>
              <div className="flex items-center justify-between mt-2 text-[10px] text-on-surface-variant font-bold">
                <span>312 resp</span><span>350</span><span>400</span><span>450</span>
                <span>500 (Fri)</span>
              </div>
            </GlassCard>
          </motion.div>
        </div>
      </section>

      {/* ════════════════════════════════════════════════════════════════════
          § 6  AUTO-SURFACED TODAY — findings feed
      ════════════════════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <SectionLabel icon="auto_awesome" label="Auto-surfaced recently" explorePath={ROUTES.INSIGHTS_SURFACED} />

        <AutoFinding
          icon="lightbulb"
          iconColor="#8329c8"
          tag="DRIVER · 2h AGO"
          tagColor="text-tertiary"
          confidence={89}
          title='"Email verification loop" is now the top driver of detractor sentiment'
          sub="+3.2 NPS projected if fixed · 18 cited quotes · n=189"
        />
        <AutoFinding
          icon="trending_up"
          iconColor="#059669"
          tag="TREND · 4h AGO"
          tagColor="text-green-700"
          confidence={91}
          title="Response velocity 2.3× normal — likely your email campaign from yesterday"
          sub="Sustained for 36h · 142 new responses · sentiment baseline +0.18 vs +0.05 avg"
        />
        <AutoFinding
          icon="balance"
          iconColor="#b41340"
          tag="META · BIAS WARNING · 6h AGO"
          tagColor="text-red-700"
          title="73% of responses are from Enterprise tier — aggregate NPS may overstate SMB experience"
          sub="Recommend stratified view or post-stratification weighting · see bias panel"
          borderLeft="#b41340"
        />
        <AutoFinding
          icon="insights"
          iconColor="#2a4bd9"
          tag="PREDICT · 8h AGO"
          tagColor="text-primary"
          confidence={81}
          title="Projected NPS at 500 responses: 51 ±4 by Friday"
          sub="Prophet + 1000-bootstrap CI · Promoters disproportionately complete in late waves"
        />
      </section>

      {/* Footer */}
      <footer className="text-center text-xs text-on-surface-variant pb-4">
        <LiveDot />{' '}
        <span className="font-bold ml-1">Live</span> · 3 insights in last 60s · Last full scan 2m ago
      </footer>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════════════

// ── Crystal centerpiece — CSS layered hexagons, spins continuously ────────
function Crystal() {
  return (
    <div
      className="relative mx-auto"
      style={{ width: 200, height: 200, filter: 'drop-shadow(0 24px 48px rgba(42,75,217,0.3))' }}
    >
      <div
        className="absolute inset-0"
        style={{
          background:
            'conic-gradient(from 0deg at 50% 50%, #879aff 0%, #d299ff 25%, #82deff 50%, #d299ff 75%, #879aff 100%)',
          clipPath: 'polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)',
          animation: 'spin-crystal 20s linear infinite',
          filter: 'blur(0.5px)',
        }}
      />
      <div
        className="absolute"
        style={{
          inset: '18%',
          background:
            'conic-gradient(from 180deg at 50% 50%, #ffffff 0%, #879aff 33%, #d299ff 66%, #ffffff 100%)',
          clipPath: 'polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)',
          animation: 'spin-crystal 10s linear infinite reverse',
          opacity: 0.75,
        }}
      />
      <div
        className="absolute"
        style={{
          inset: '38%',
          background: 'radial-gradient(circle, #ffffff, #82deff)',
          borderRadius: '50%',
          filter: 'blur(5px)',
          animation: 'pulse-glow 2.5s ease-in-out infinite',
        }}
      />
      <style>{`
        @keyframes spin-crystal {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// ── Section label — divider with icon + label + optional explore link ────
function SectionLabel({ label, icon, explorePath }: { label: string; icon: string; explorePath?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border/40" />
      <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.25em] text-on-surface-variant">
        <Icon name={icon} size={13} />
        {label}
      </div>
      {explorePath && (
        <Link
          to={explorePath}
          className="flex items-center gap-1 text-[10px] font-black uppercase tracking-[0.2em] text-primary hover:text-primary/70 transition-colors"
        >
          See full analysis
          <Icon name="arrow_forward" size={11} />
        </Link>
      )}
      <div className="h-px flex-1 bg-border/40" />
    </div>
  );
}

// ── Dark prompt chip (for dark hero section) ──────────────────────────────
function DarkPromptChip({ icon, label, onClick }: { icon?: string; label: string; onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-colors"
      style={{
        background: 'rgba(255,255,255,0.08)',
        border: '1px solid rgba(255,255,255,0.12)',
        color: 'rgba(255,255,255,0.80)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.14)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.08)';
      }}
    >
      {icon && <Icon name={icon} size={13} style={{ color: 'rgba(255,255,255,0.7)' }} />}
      {label}
    </button>
  );
}

// ── Auto-surfaced finding card ────────────────────────────────────────────
function AutoFinding({
  icon,
  iconColor,
  tag,
  tagColor,
  confidence,
  title,
  sub,
  borderLeft,
}: {
  icon: string;
  iconColor: string;
  tag: string;
  tagColor: string;
  confidence?: number;
  title: string;
  sub: string;
  borderLeft?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] }}
    >
      <GlassCard
        className="p-5 flex items-start gap-4 hover:scale-[1.005] transition-transform cursor-pointer"
        style={borderLeft ? { borderLeft: `4px solid ${borderLeft}` } : undefined}
      >
        <Icon name={icon} size={22} style={{ color: iconColor, marginTop: 2 }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`text-[10px] font-black uppercase tracking-widest ${tagColor}`}>
              {tag}
            </span>
            {confidence !== undefined && <ConfidenceChip value={confidence} />}
          </div>
          <div className="font-bold text-sm mb-1">{title}</div>
          <p className="text-xs text-on-surface-variant">{sub}</p>
        </div>
        <Icon
          name="arrow_forward"
          size={17}
          className="text-on-surface-variant self-center flex-shrink-0"
        />
      </GlassCard>
    </motion.div>
  );
}
