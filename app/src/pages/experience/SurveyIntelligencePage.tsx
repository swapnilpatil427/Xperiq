// SurveyIntelligencePage — Single-survey intelligence, one synthesized scroll.
//
// Design synthesis (no tabs, no view switching):
//   § 1  Sticky command strip    — survey title, KPI chips, sub-nav, regenerate
//   § 2  Tier progression banner — collecting → first_voices → early_signals → growing_picture
//   § 3  Pipeline animation      — 10-node progress when generating
//   § 4  Hero                    — Conversation Studio crystal (no insights) or
//                                  Editorial headline + cited brief (with insights)
//   § 5  Metric tiles            — Cockpit KPI strip: NPS gauge, CSAT, Top Action
//   § 6  Priority feed           — Cockpit severity-bordered rows, all insights by priority
//   § 7  Deeper findings bento   — Editorial 12-col grid: driver + anomaly + voice + prescriptive
//   § 8  Crystal ask bar         — always accessible inline
//   § 9  Trust footer            — citation validity, last scan, sample quality
//
// Business logic: all data flows from real API — crystal_opening, agenticInsights,
// survey metrics, pipeline polling. Nothing is hardcoded.

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from '../../lib/i18n';
import { useSetPageTitle } from '../../contexts/pageTitle';
import { useSurveys } from '../../hooks/useSurveys';
import { useInsights } from '../../hooks/useInsights';
import { useApi } from '../../hooks/useApi';
import { useCrystalPanel } from '../../contexts/crystalPanel';
import { Icon } from '../../components/Icon';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ROUTES, toPath } from '../../constants/routes';
import {
  GlassCard, CitationChip, ConfidenceChip, CIBar, LayerBadge,
  LiveDot, LAYER_CONFIG, SENTIMENT_BORDER,
} from '../insights/shared';
import { GeneratingOverlay } from '../insights/GeneratingOverlay';
import { ProgressArc } from '../../components/insights/ProgressArc';
import type { AgenticInsight } from '../../types';

// Pipeline node IDs — labels resolved via t() inside the component
const PIPELINE_NODE_IDS = ['ingest','embed','metrics','absa','cluster','topics','narrate','verify','evaluate','publish'] as const;
const PIPELINE_NODE_ICONS: Record<string, string> = {
  ingest:'download', embed:'memory', metrics:'analytics', absa:'sentiment_satisfied',
  cluster:'hub', topics:'topic', narrate:'edit_note', verify:'fact_check',
  evaluate:'verified', publish:'publish',
};

// ── Layer → Cockpit severity border color ─────────────────────────────────────
const SEV_COLOR: Record<AgenticInsight['layer'], string> = {
  prescriptive: '#059669',
  predictive:   '#d97706',
  diagnostic:   '#8329c8',
  descriptive:  '#2a4bd9',
};

function npsColor(v: number | null) {
  if (v == null) return 'var(--color-on-surface-variant)';
  return v >= 50 ? '#059669' : v >= 0 ? '#d97706' : '#b41340';
}
function npsLabel(v: number | null) {
  if (v == null) return '—';
  return v > 0 ? `+${v}` : String(v);
}
function npsCI(score: number | null, n: number) {
  if (score == null || n < 5) return 0;
  const p = (score + 100) / 200;
  return Math.round(1.645 * Math.sqrt((p * (1 - p)) / n) * 200);
}
function computeTier(n: number, hasInsights: boolean) {
  if (n < 10)  return 'collecting'      as const;
  if (n < 40)  return 'first_voices'    as const;
  if (n < 70)  return 'early_signals'   as const;
  if (n < 100) return 'growing_picture' as const;
  return hasInsights ? 'full_report' : 'growing_picture' as const;
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function SurveyIntelligencePage() {
  const { surveyId } = useParams<{ surveyId: string }>();
  const { t }   = useTranslation();
  const api     = useApi();
  const { surveys, loading: surveysLoading } = useSurveys();
  const { setScope: setCrystalScope, openCrystal, setCrystalData } = useCrystalPanel();

  const survey = surveys.find((s) => s.id === surveyId);

  // Build pipeline nodes with localised labels
  const PIPELINE_NODES = PIPELINE_NODE_IDS.map((id) => ({
    id,
    label: t(`experience.intelligence.pipeline.${id}`),
    icon:  PIPELINE_NODE_ICONS[id] ?? 'circle',
  }));

  // ── Agentic insight state ────────────────────────────────────────────────
  const [agenticInsights, setAgenticInsights] = useState<AgenticInsight[]>([]);
  const [agenticLoading,  setAgenticLoading]  = useState(false);
  const [crystalOpening,  setCrystalOpening]  = useState<string | null>(null);

  // ── Pipeline state ───────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [nodesDone,  setNodesDone]  = useState<string[]>([]);
  const [genError,   setGenError]   = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Legacy insights (NPS/CSAT from before the pipeline ran)
  const { insights, generating: legacyGenerating } = useInsights(surveyId);

  useSetPageTitle(
    survey?.title ?? t('nav.experience'),
    survey ? `${(survey.response_count ?? 0).toLocaleString()} ${t('common.responses')}` : t('experience.hub.subtitle'),
  );

  // Scope Crystal to this survey on mount; inject data; reset on unmount
  useEffect(() => {
    if (surveyId) setCrystalScope(surveyId);
    return () => { setCrystalScope('all'); setCrystalData([], []); };
  }, [surveyId, setCrystalScope, setCrystalData]);

  // Load agentic insights on mount
  const loadAgentic = useCallback(async () => {
    if (!surveyId) return;
    setAgenticLoading(true);
    try {
      const r = await api.listInsights(surveyId);
      const loaded = r.insights ?? [];
      setAgenticInsights(loaded);
      setCrystalOpening(r.crystal_opening ?? null);
      setCrystalData(loaded, []);
    } catch {
      setAgenticInsights([]);
    } finally {
      setAgenticLoading(false);
    }
  }, [api, surveyId, setCrystalData]);

  useEffect(() => {
    loadAgentic();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [loadAgentic]);

  // Trigger pipeline + poll for completion
  const handleGenerate = useCallback(async () => {
    if (!surveyId || generating) return;
    setGenerating(true);
    setNodesDone([]);
    setGenError(null);
    try {
      await api.triggerInsightGeneration(surveyId);
    } catch {
      setGenError(t('experience.intelligence.generate.errorStart'));
      setGenerating(false);
      return;
    }
    let elapsed = 0;
    pollRef.current = setInterval(async () => {
      elapsed += 3;
      try {
        const { status, stream_events } = await api.getInsightRunStatus(surveyId);
        const completed = (stream_events as Array<{ event: string; agent: string }>)
          .filter((e) => e.event === 'node_complete')
          .map((e) => e.agent);
        setNodesDone(completed);
        if (status === 'failed') {
          clearInterval(pollRef.current!);
          setGenError(t('experience.intelligence.generate.errorFailed'));
          setGenerating(false);
        } else if (status === 'completed') {
          clearInterval(pollRef.current!);
          setNodesDone(PIPELINE_NODES.map((n) => n.id));
          await new Promise((r) => setTimeout(r, 700));
          await loadAgentic();
          setGenerating(false);
          setNodesDone([]);
        }
      } catch { /* keep polling */ }
      if (elapsed >= 120) {
        clearInterval(pollRef.current!);
        setGenError(t('experience.intelligence.generate.errorTimeout'));
        setGenerating(false);
      }
    }, 3000);
  }, [api, surveyId, generating, loadAgentic]);

  // ── Derived values ────────────────────────────────────────────────────────
  const isActive  = survey?.status === 'active';
  // Prefer agentic metrics (from the completed pipeline) over stale cached values.
  // avg_csat is NOT stored on the surveys table — derive it from the metric.csat insight.
  const npsInsight  = agenticInsights.find((i) => i.category === 'metric.nps');
  const csatInsight = agenticInsights.find((i) => i.category === 'metric.csat');
  const nps  = npsInsight?.metric_json?.value  != null
    ? Math.round(npsInsight.metric_json.value)
    : (survey?.nps_score ?? insights?.nps_score ?? null);
  const csat = csatInsight?.metric_json?.value != null
    ? csatInsight.metric_json.value
    : null;   // Only available after pipeline runs — show "—" otherwise
  const resCount  = survey?.response_count ?? 0;
  const hasInsights = agenticInsights.length > 0;
  const tier      = computeTier(resCount, hasInsights);

  // Sorted insights: priority DESC, then trust DESC
  const sortedInsights = [...agenticInsights].sort(
    (a, b) => b.priority - a.priority || b.trust_score - a.trust_score,
  );

  // Bento cards: pick one representative insight per quadrant
  const topPrescriptive = sortedInsights.find((i) => i.layer === 'prescriptive');
  const topDiagnostic   = sortedInsights.find((i) => i.layer === 'diagnostic');
  const topPredictive   = sortedInsights.find((i) => i.layer === 'predictive');
  const topVoice        = sortedInsights.find((i) => i.category === 'voice.topic');

  // Trust summary
  const avgTrust = hasInsights
    ? Math.round(sortedInsights.reduce((s, i) => s + i.trust_score, 0) / sortedInsights.length)
    : null;
  const lastGenerated = sortedInsights[0]?.generated_at ?? null;

  // ── Surveys-loaded-but-survey-not-found guard ────────────────────────────
  // Only show "not found" after surveys have finished loading AND the surveyId
  // doesn't match any survey in the array (or loading returned 0 surveys).
  const surveyNotFound = !surveysLoading && !survey && !!surveyId;

  if (surveyNotFound) {
    return (
      <div className="max-w-3xl mx-auto w-full pt-12">
        <div className="glass-card-premium rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'linear-gradient(135deg, rgba(180,19,64,0.10), rgba(180,19,64,0.06))' }}>
            <Icon name="search_off" size={32} style={{ color: '#b41340' }} />
          </div>
          <h2 className="text-xl font-black font-headline mb-2">{t('experience.intelligence.notFound.title')}</h2>
          <p className="text-sm text-on-surface-variant mb-5 max-w-xs mx-auto">
            {t('experience.intelligence.notFound.body')}
          </p>
          <Link to={ROUTES.EXPERIENCE}>
            <Button className="font-bold text-white border-0"
              style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
              <Icon name="arrow_back" size={15} /> {t('experience.intelligence.notFound.backCta')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className="max-w-7xl mx-auto w-full space-y-5">

        {/* ══════════════════════════════════════════════════════════════════
            § 1  STICKY COMMAND STRIP
        ══════════════════════════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          className="glass-card-premium rounded-2xl px-5 py-3.5 sticky top-0 z-20 flex items-center gap-4 flex-wrap"
          style={{ boxShadow: '0 4px 24px rgba(0,0,0,0.07), inset 0 1px 0 rgba(255,255,255,0.9)' }}
        >
          <Link to={ROUTES.EXPERIENCE}
            className="text-[10px] font-bold text-on-surface-variant hover:text-primary transition-colors flex items-center gap-1">
            <Icon name="arrow_back" size={12} /> {t('experience.nav.backToExperience')}
          </Link>
          <span className="text-outline-variant text-xs">/</span>

          <div className="flex items-center gap-2 flex-1 min-w-0">
            {isActive && <span className="flex items-center gap-1 text-[10px] font-black text-emerald-600 flex-shrink-0"><LiveDot color="#059669" size={5} />{t('experience.common.live')}</span>}
            <h1 className="font-headline font-bold text-sm truncate">{survey?.title ?? '…'}</h1>
          </div>

          {/* KPI chips */}
          <div className="flex items-center divide-x divide-outline-variant/30">
            {nps != null && (
              <div className="px-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant leading-none mb-0.5">{t('experience.common.nps')}</div>
                <div className="text-lg font-black font-headline leading-none" style={{ color: npsColor(nps) }}>
                  {npsLabel(nps)}
                </div>
              </div>
            )}
            {csat != null && (
              <div className="px-3 text-center">
                <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant leading-none mb-0.5">{t('experience.common.csat')}</div>
                <div className="text-lg font-black font-headline leading-none">{csat.toFixed(1)}</div>
              </div>
            )}
            <div className="px-3 text-center">
              <div className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant leading-none mb-0.5">{t('experience.common.responses')}</div>
              <div className="text-lg font-black font-headline leading-none">{resCount.toLocaleString()}</div>
            </div>
          </div>

          {/* Sub-nav — Intelligence is active on this page */}
          <div className="flex items-center gap-1 flex-wrap">
            {([
              { label: t('experience.nav.intelligence'), icon: 'auto_awesome', path: toPath(ROUTES.EXPERIENCE_SURVEY, { surveyId: surveyId! }), active: true },
              { label: t('experience.nav.topics'),       icon: 'hub',          path: toPath(ROUTES.EXPERIENCE_SURVEY_TOPICS, { surveyId: surveyId! }) },
              { label: t('experience.nav.advanced'),     icon: 'analytics',    path: `${ROUTES.ADVANCED_INSIGHTS}?survey=${surveyId}` },
              { label: t('experience.nav.trends'),       icon: 'timeline',     path: toPath(ROUTES.EXPERIENCE_SURVEY_TRENDS, { surveyId: surveyId! }) },
              { label: t('experience.nav.report'),       icon: 'description',  path: toPath(ROUTES.EXPERIENCE_SURVEY_REPORT, { surveyId: surveyId! }) },
            ] as const).map((item) => (
              <Link key={item.label} to={item.path}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-bold transition-all"
                style={'active' in item && item.active ? {
                  background: 'linear-gradient(135deg, var(--color-primary), var(--color-tertiary))',
                  color: 'white',
                  boxShadow: '0 2px 8px rgba(42,75,217,0.25)',
                } : {
                  color: 'var(--color-on-surface-variant)',
                }}>
                <Icon name={item.icon} size={12} />{item.label}
              </Link>
            ))}
          </div>

          {/* Regenerate */}
          <Button size="sm" onClick={handleGenerate} disabled={generating || legacyGenerating}
            className="text-xs font-bold text-white border-0 flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
            {(generating || legacyGenerating)
              ? <><span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />{t('experience.intelligence.generate.generating')}</>
              : <><Icon name="auto_awesome" size={13} />{t('experience.intelligence.generate.button')}</>}
          </Button>
        </motion.div>

        {/* Survey status badge */}
        {survey && survey.status !== 'active' && <SurveyStatusBadge status={survey.status} />}

        {/* Persistent error banner — shown any time generation has failed, even after generating stops */}
        {genError && !generating && (
          <div className="flex items-start gap-3 px-4 py-3 rounded-xl border text-sm"
            style={{ background: '#fff1f2', borderColor: '#fecdd3', color: '#b41340' }}>
            <Icon name="error_outline" size={16} style={{ flexShrink: 0, marginTop: 1 }} />
            <div className="flex-1">
              <p className="font-bold">{t('experience.intelligence.generate.errorBannerTitle')}</p>
              <p className="text-xs mt-0.5 opacity-80">{genError}</p>
            </div>
            <button onClick={() => setGenError(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100 transition-opacity flex-shrink-0">
              {t('experience.intelligence.generate.dismiss')}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            § 2  TIER PROGRESSION BANNER
        ══════════════════════════════════════════════════════════════════ */}
        {tier !== 'full_report' && (
          <TierBanner
            tier={tier} resCount={resCount}
            onGenerate={handleGenerate}
            isGenerating={generating || legacyGenerating}
            surveyStatus={survey?.status ?? 'active'}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            § 3  PIPELINE ANIMATION
        ══════════════════════════════════════════════════════════════════ */}
        <GeneratingOverlay
          generating={generating}
          nodesDone={nodesDone}
          genError={!hasInsights ? genError : null}
          nodes={PIPELINE_NODES}
          focusSurvey={survey}
          onRetry={handleGenerate}
        />

        {/* ══════════════════════════════════════════════════════════════════
            § 4  HERO
            No insights → Conversation Studio dark crystal hero
            Has insights → Editorial narrative brief with crystal_opening
        ══════════════════════════════════════════════════════════════════ */}
        {!generating && (
          <AnimatePresence mode="wait">
            {hasInsights ? (
              <motion.div key="editorial-hero"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}>
                <EditorialHero
                  nps={nps} resCount={resCount}
                  crystalOpening={crystalOpening}
                  topInsight={sortedInsights[0] ?? null}
                  onGenerate={handleGenerate}
                  isGenerating={generating}
                />
              </motion.div>
            ) : !agenticLoading ? (
              <motion.div key="crystal-hero"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ duration: 0.6 }}>
                <CrystalHeroEmpty
                  tier={tier} resCount={resCount}
                  onGenerate={handleGenerate}
                  isGenerating={generating || legacyGenerating}
                  surveyId={surveyId!}
                  surveyTitle={survey?.title}
                />
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            § 5  METRIC TILES (Cockpit KPI strip + Editorial gauge style)
            Only shown when we have real metrics
        ══════════════════════════════════════════════════════════════════ */}
        {hasInsights && !generating && (
          <MetricTiles
            nps={nps} csat={csat} resCount={resCount}
            sparkline={survey?.sparkline}
            topPrescriptive={topPrescriptive ?? null}
            hasInsights={hasInsights}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            § 6  PRIORITY INTELLIGENCE FEED (Cockpit severity-bordered rows)
        ══════════════════════════════════════════════════════════════════ */}
        {hasInsights && !generating && sortedInsights.length > 0 && (
          <PriorityFeed
            insights={sortedInsights}
            surveyId={surveyId!}
            onAskCrystal={(headline) => openCrystal(headline)}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            § 7  DEEPER FINDINGS BENTO (Editorial 12-col asymmetric grid)
            Uses the best single insight from each layer
        ══════════════════════════════════════════════════════════════════ */}
        {hasInsights && !generating && (
          <DeeperFindings
            topDiagnostic={topDiagnostic ?? null}
            topPredictive={topPredictive ?? null}
            topVoice={topVoice ?? null}
            topPrescriptive={topPrescriptive ?? null}
            onAskCrystal={(headline) => openCrystal(headline)}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            § 8  CRYSTAL ASK BAR (always accessible, Conversation Studio)
        ══════════════════════════════════════════════════════════════════ */}
        {!generating && (
          <CrystalAskBar
            surveyId={surveyId!}
            hasInsights={hasInsights}
            topInsight={sortedInsights[0] ?? null}
            onAsk={(q) => openCrystal(q)}
          />
        )}

        {/* ══════════════════════════════════════════════════════════════════
            § 9  TRUST FOOTER (Cockpit trust panel)
        ══════════════════════════════════════════════════════════════════ */}
        {hasInsights && !generating && (
          <TrustFooter
            insights={sortedInsights}
            avgTrust={avgTrust}
            lastGenerated={lastGenerated}
            resCount={resCount}
          />
        )}

      </div>
    </TooltipProvider>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// § 4a  EDITORIAL HERO — shown when insights exist
// Crystal opening text (LLM-generated portfolio brief) + top insight headline
// ══════════════════════════════════════════════════════════════════════════════
function EditorialHero({
  nps, resCount, crystalOpening, topInsight, onGenerate, isGenerating,
}: {
  nps: number | null; resCount: number; crystalOpening: string | null;
  topInsight: AgenticInsight | null; onGenerate: () => void; isGenerating: boolean;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-start gap-6"
    >
      {/* Holographic orb (Editorial pattern) */}
      <div
        className="w-28 h-28 rounded-2xl flex items-center justify-center flex-shrink-0 holographic hidden md:flex"
        style={{
          background: 'linear-gradient(135deg, #2a4bd9, #8329c8)',
          boxShadow: '0 10px 30px -10px rgba(42,75,217,0.4), inset 0 2px 4px rgba(255,255,255,0.2)',
          animation: 'float-bob 6s ease-in-out infinite',
        }}
      >
        <Icon name="diamond" size={40} style={{ color: 'white' }} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary mb-2">
          Crystal · Generated insight brief
        </div>
        {/* crystalOpening is the LLM-generated narrative — never hardcoded */}
        {crystalOpening ? (
          <h2 className="text-3xl md:text-4xl font-black font-headline tracking-tight leading-tight mb-4 max-w-3xl">
            {crystalOpening}
          </h2>
        ) : topInsight ? (
          <h2 className="text-3xl md:text-4xl font-black font-headline tracking-tight leading-tight mb-4 max-w-3xl">
            {topInsight.headline}
          </h2>
        ) : (
          <h2 className="text-3xl font-black font-headline tracking-tight leading-tight mb-4 text-on-surface-variant max-w-2xl">
            Intelligence ready — {resCount.toLocaleString()} responses analysed
          </h2>
        )}

        {/* Brief glass card with top citation if available */}
        {topInsight?.narrative && (
          <GlassCard className="p-5 max-w-3xl mb-4">
            <p className="text-sm leading-relaxed font-medium text-on-surface">
              {topInsight.narrative.length > 280
                ? topInsight.narrative.slice(0, 280) + '…'
                : topInsight.narrative}
              {topInsight.citations_json.slice(0, 3).map((c) => (
                <CitationChip key={c.response_id} id={c.response_id.slice(-4)} title={c.quote} />
              ))}
            </p>
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-outline-variant/25">
              <ConfidenceChip value={topInsight.trust_score} />
              <span className="text-xs text-on-surface-variant">
                {topInsight.citations_json.length} cited responses · n={resCount.toLocaleString()}
              </span>
              <div className="flex-1" />
              <Button variant="outline" size="sm" className="text-xs"
                onClick={() => onGenerate()} disabled={isGenerating}>
                <Icon name="refresh" size={13} /> Refresh
              </Button>
            </div>
          </GlassCard>
        )}
      </div>
    </motion.section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// § 4b  CRYSTAL HERO EMPTY — shown when no insights yet (Conversation Studio)
// ══════════════════════════════════════════════════════════════════════════════
function CrystalHeroEmpty({
  tier, resCount, onGenerate, isGenerating, surveyId, surveyTitle,
}: {
  tier: ReturnType<typeof computeTier>; resCount: number;
  onGenerate: () => void; isGenerating: boolean;
  surveyId: string; surveyTitle?: string;
}) {
  const { t } = useTranslation();
  const tierKey = tier === 'full_report' ? 'growing_picture' : tier;
  const msg = {
    headline: t(`experience.intelligence.tier.${tierKey}.headline`),
    sub:      t(`experience.intelligence.tier.${tierKey}.body`),
  };
  const canGenerate = tier !== 'collecting';

  return (
    <div
      className="relative overflow-hidden rounded-2xl text-white text-center px-8 py-14"
      style={{
        background:
          'radial-gradient(ellipse at 25% 0%, rgba(42,75,217,0.50) 0%, transparent 55%),' +
          'radial-gradient(ellipse at 75% 20%, rgba(131,41,200,0.40) 0%, transparent 55%),' +
          'linear-gradient(180deg, #07091F 0%, #0F0822 70%, #080A22 100%)',
      }}
    >
      {/* Perspective grid floor */}
      <div className="absolute inset-x-0 bottom-0 pointer-events-none" style={{
        height: '40%',
        backgroundImage: 'linear-gradient(rgba(135,154,255,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(135,154,255,0.07) 1px, transparent 1px)',
        backgroundSize: '56px 56px',
        transform: 'perspective(800px) rotateX(45deg)', transformOrigin: 'bottom',
        maskImage: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)',
      }} />

      <div className="relative z-10">
        {/* Crystal orb (Conversation Studio CSS) */}
        <div className="flex justify-center mb-6">
          <div style={{ width: 120, height: 120, position: 'relative', filter: 'drop-shadow(0 20px 40px rgba(42,75,217,0.5))' }}>
            <div style={{ position: 'absolute', inset: 0, background: 'conic-gradient(from 0deg at 50% 50%, #879aff 0%, #d299ff 25%, #82deff 50%, #d299ff 75%, #879aff 100%)', clipPath: 'polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)', animation: 'exp-hub-spin 20s linear infinite', filter: 'blur(0.5px)' }} />
            <div style={{ position: 'absolute', inset: '18%', background: 'conic-gradient(from 180deg at 50% 50%, #ffffff 0%, #879aff 33%, #d299ff 66%, #ffffff 100%)', clipPath: 'polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)', animation: 'exp-hub-spin 10s linear infinite reverse', opacity: 0.75 }} />
            <div style={{ position: 'absolute', inset: '38%', background: 'radial-gradient(circle, #ffffff, #82deff)', borderRadius: '50%', filter: 'blur(5px)', animation: 'pulse-glow 2.5s ease-in-out infinite' }} />
          </div>
        </div>

        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-300/75 mb-3">
          {t('experience.intelligence.hero.tagline')} · {surveyTitle ?? t('nav.experience')}
        </div>
        <h2 className="text-2xl md:text-3xl font-black font-headline tracking-tight mb-3">
          {msg.headline}
        </h2>
        <p className="text-sm text-white/55 mb-7 max-w-md mx-auto">{msg.sub}</p>

        <div className="flex items-center justify-center gap-3 flex-wrap">
          {canGenerate && (
            <Button
              onClick={onGenerate} disabled={isGenerating}
              className="font-bold text-white border-0 shadow-xl px-6"
              style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
              {isGenerating
                ? <><span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />{t('experience.intelligence.generate.generating')}</>
                : <><Icon name="auto_awesome" size={16} />{t('experience.intelligence.generate.button')}</>}
            </Button>
          )}
          {tier === 'collecting' && (
            <Link to={ROUTES.RESPONDENTS}>
              <Button variant="outline" className="font-bold border-white/20 text-white bg-white/10 hover:bg-white/20 px-6">
                <Icon name="share" size={15} /> {t('experience.intelligence.tierBanner.share')}
              </Button>
            </Link>
          )}
        </div>

        {/* Progress arc + response count */}
        <div className="flex items-center justify-center gap-3 mt-6">
          <ProgressArc tier={tier} responseCount={resCount} size="sm" />
          <span className="text-[11px] text-white/50">
            {t('experience.intelligence.hero.responsesCount', { n: resCount.toLocaleString() })}
          </span>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// § 5  METRIC TILES (Cockpit KPI strip style)
// Real data: nps_score, avg_csat, top prescriptive insight, sparkline
// ══════════════════════════════════════════════════════════════════════════════
function MetricTiles({
  nps, csat, resCount, sparkline, topPrescriptive, hasInsights,
}: {
  nps: number | null; csat: number | null; resCount: number;
  sparkline?: number[]; topPrescriptive: AgenticInsight | null; hasInsights: boolean;
}) {
  const { t } = useTranslation();
  const ci = npsCI(nps, resCount);
  const ciPos = nps != null ? Math.round(((nps + 100) / 200) * 100) : 50;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.1 }}
      className="grid grid-cols-1 md:grid-cols-3 gap-4"
    >
      {/* NPS tile */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t('experience.intelligence.metrics.nps')}</span>
          {nps != null && <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5"><Icon name="trending_up" size={12} /></span>}
        </div>
        <div className="flex items-baseline gap-2 mb-1">
          <span className="text-5xl font-black font-headline" style={{ color: npsColor(nps) }}>
            {npsLabel(nps)}
          </span>
          {ci > 0 && <span className="text-on-surface-variant text-sm font-mono">±{ci}</span>}
        </div>
        <CIBar position={ciPos} width={120} />
        {/* Sparkline: survey.sparkline = daily response counts (7d), not NPS values.
            Shows response velocity as activity context under the NPS number. */}
        {sparkline && sparkline.length >= 3 ? (
          <>
            <MiniSparkline points={sparkline.slice(-7)} />
            <div className="text-[9px] text-on-surface-variant/50 mt-0.5">{t('experience.intelligence.metrics.sparklineLabel')}</div>
          </>
        ) : (
          <div className="mt-3 h-10 flex items-end gap-0.5 opacity-20">
            {[4,5,3,7,5,8,6].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm bg-primary" style={{ height: `${h * 4}px` }} />
            ))}
          </div>
        )}
      </GlassCard>

      {/* CSAT tile */}
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t('experience.intelligence.metrics.csat')}</span>
          <span className="text-[10px] text-on-surface-variant/60">{t('experience.intelligence.metrics.csatScale')}</span>
        </div>
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-5xl font-black font-headline">
            {csat != null ? csat.toFixed(1) : '—'}
          </span>
          {csat != null && <span className="text-on-surface-variant text-sm">{t('experience.intelligence.metrics.csatSuffix')}</span>}
        </div>
        {csat != null && (
          <div className="flex items-end gap-1.5 h-10">
            {[25, 38, 55, 78, 92].map((h, i) => (
              <div key={i} className="flex-1 rounded-t-sm"
                style={{ height: `${h}%`, background: i === 4 ? 'linear-gradient(to top, #00647c, #2a4bd9)' : `rgba(0,100,124,${0.25 + i * 0.14})` }} />
            ))}
          </div>
        )}
        {csat == null && (
          <p className="text-xs text-on-surface-variant/60">
            {hasInsights
              ? t('experience.intelligence.metrics.csatNoQuestion')
              : t('experience.intelligence.metrics.csatNoInsights')}
          </p>
        )}
      </GlassCard>

      {/* Top Action tile — from real prescriptive insight */}
      {topPrescriptive ? (
        <div className="rounded-2xl p-6 holographic text-white relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
          <div className="flex items-center justify-between mb-3 relative z-10">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-90">{t('experience.intelligence.metrics.topAction')}</span>
            <ConfidenceChip value={topPrescriptive.trust_score} dark />
          </div>
          <h3 className="text-lg font-black font-headline leading-tight mb-2 relative z-10">
            {topPrescriptive.recommended_action?.label ?? topPrescriptive.headline}
          </h3>
          {topPrescriptive.metric_json?.value != null && (
            <p className="text-sm font-bold opacity-90 mb-3 relative z-10">
              {t('experience.intelligence.metrics.projectedImpact', { n: topPrescriptive.metric_json.value.toFixed(1) })}
            </p>
          )}
          <div className="flex items-center gap-2 relative z-10">
            <Button size="sm" className="bg-white text-primary hover:bg-white/90 text-xs font-bold">
              <Icon name="flag" size={13} /> {t('experience.intelligence.metrics.createTicket')}
            </Button>
            {topPrescriptive.citations_json.length > 0 && (
              <span className="text-xs opacity-80">{t('experience.intelligence.metrics.cited', { n: String(topPrescriptive.citations_json.length) })}</span>
            )}
          </div>
        </div>
      ) : (
        <GlassCard className="p-6 flex flex-col items-center justify-center text-center">
          <Icon name="flag" size={28} style={{ color: 'var(--color-primary)', marginBottom: 8, opacity: 0.4 }} />
          <p className="text-sm text-on-surface-variant">{t('experience.intelligence.metrics.prescriptiveEmpty')}</p>
        </GlassCard>
      )}
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// § 6  PRIORITY INTELLIGENCE FEED (Cockpit severity-bordered rows)
// All insights sorted by priority, real pipeline data
// ══════════════════════════════════════════════════════════════════════════════
function PriorityFeed({
  insights, surveyId, onAskCrystal,
}: {
  insights: AgenticInsight[];
  surveyId: string;
  onAskCrystal: (headline: string) => void;
}) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<AgenticInsight['layer'] | 'all'>('all');
  const filtered = filter === 'all' ? insights : insights.filter((i) => i.layer === filter);
  const layerCounts = {
    prescriptive: insights.filter((i) => i.layer === 'prescriptive').length,
    predictive:   insights.filter((i) => i.layer === 'predictive').length,
    diagnostic:   insights.filter((i) => i.layer === 'diagnostic').length,
    descriptive:  insights.filter((i) => i.layer === 'descriptive').length,
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.15 }}
    >
      <GlassCard className="overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-outline-variant/20 sticky top-[4.5rem] z-10 bg-white/80 backdrop-blur-lg flex-wrap">
          <Icon name="bolt" size={17} style={{ color: 'var(--color-primary)' }} />
          <span className="font-headline font-bold text-sm">{t('experience.intelligence.feed.title')}</span>
          <span className="px-1.5 py-0.5 rounded bg-surface-container text-[9px] font-black font-mono text-on-surface-variant">{insights.length}</span>
          <div className="flex-1" />
          {/* Filter pills */}
          <div className="flex items-center gap-1">
            {([
              { id: 'all'          as const, label: t('experience.intelligence.feed.filters.all')          },
              { id: 'prescriptive' as const, label: t('experience.intelligence.feed.filters.prescriptive') },
              { id: 'predictive'   as const, label: t('experience.intelligence.feed.filters.predictive')   },
              { id: 'diagnostic'   as const, label: t('experience.intelligence.feed.filters.diagnostic')   },
              { id: 'descriptive'  as const, label: t('experience.intelligence.feed.filters.descriptive')  },
            ] as const).map(({ id, label }) => (
              <button key={id}
                onClick={() => setFilter(id)}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold transition-all"
                style={filter === id
                  ? { background: id === 'all' ? 'var(--color-primary)' : SEV_COLOR[id as AgenticInsight['layer']] ?? 'var(--color-primary)', color: 'white' }
                  : { background: 'transparent', color: 'var(--color-on-surface-variant)' }}>
                {label}
                {id !== 'all' && layerCounts[id as keyof typeof layerCounts] > 0 && (
                  <span className="ml-1 opacity-70">({layerCounts[id as keyof typeof layerCounts]})</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Feed rows */}
        <div className="divide-y divide-outline-variant/12">
          {filtered.slice(0, 10).map((insight, idx) => {
            const sevColor = insight.trust_score < 60 ? '#b41340' : SEV_COLOR[insight.layer];
            const topQuote = insight.citations_json[0];
            return (
              <motion.div
                key={insight.id}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: idx * 0.04 }}
                className="group flex items-start gap-4 px-5 py-4 hover:bg-surface-container/40 transition-colors"
                style={{ borderLeft: `3px solid ${sevColor}` }}
              >
                {/* Layer icon */}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: LAYER_CONFIG[insight.layer]?.bg ?? '#e0f2fe' }}>
                  <Icon name={
                    insight.layer === 'prescriptive' ? 'flag' :
                    insight.layer === 'predictive'   ? 'insights' :
                    insight.layer === 'diagnostic'   ? 'local_fire_department' : 'bar_chart'
                  } size={15} style={{ color: LAYER_CONFIG[insight.layer]?.color ?? '#0369a1' }} />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: sevColor }}>
                      {insight.layer} · {insight.category?.split('.').pop() ?? ''}
                    </span>
                    <ConfidenceChip value={insight.trust_score} />
                    {insight.citations_json.length > 0 && (
                      <span className="text-[9px] text-on-surface-variant font-mono">{t('experience.common.citations', { n: String(insight.citations_json.length) })}</span>
                    )}
                  </div>
                  <p className="text-sm font-semibold text-on-surface leading-snug mb-1">{insight.headline}</p>
                  {topQuote?.quote && (
                    <p className="text-[11px] text-on-surface-variant/70 italic line-clamp-1">
                      "{topQuote.quote}"
                    </p>
                  )}
                  {insight.recommended_action && (
                    <div className="mt-1.5 flex items-center gap-1.5">
                      <Icon name="bolt" size={11} style={{ color: 'var(--color-primary)' }} />
                      <span className="text-[11px] font-semibold text-primary">{insight.recommended_action.label}</span>
                    </div>
                  )}
                </div>

                {/* Ask Crystal per-insight */}
                <button
                  onClick={() => onAskCrystal(insight.headline)}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-all hover:bg-primary/10 self-start mt-1"
                  style={{ color: 'var(--color-primary)' }}
                  title={t('experience.intelligence.feed.askTooltip')}
                >
                  <Icon name="psychology" size={13} /> {t('experience.common.askShort')}
                </button>
              </motion.div>
            );
          })}

          {/* Streaming tail */}
          <div className="px-5 py-3 flex items-center gap-3 text-on-surface-variant/60 text-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" style={{ animation: 'pulse-glow 2s ease-in-out infinite' }} />
            <span className="font-medium">{t('experience.intelligence.feed.monitoring')}</span>
          </div>
        </div>
      </GlassCard>
    </motion.section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// § 7  DEEPER FINDINGS BENTO (Editorial asymmetric 12-col grid)
// ══════════════════════════════════════════════════════════════════════════════
function DeeperFindings({
  topDiagnostic, topPredictive, topVoice, topPrescriptive, onAskCrystal,
}: {
  topDiagnostic: AgenticInsight | null; topPredictive: AgenticInsight | null;
  topVoice: AgenticInsight | null; topPrescriptive: AgenticInsight | null;
  onAskCrystal: (headline: string) => void;
}) {
  const { t } = useTranslation();
  if (!topDiagnostic && !topPredictive && !topVoice && !topPrescriptive) return null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.2 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-outline-variant/25" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant">{t('experience.intelligence.feed.deeper')}</span>
        <div className="h-px flex-1 bg-outline-variant/25" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Diagnostic / Driver — wide */}
        {topDiagnostic && (
          <div className="lg:col-span-7">
            <BentoCard insight={topDiagnostic} onAskCrystal={onAskCrystal} />
          </div>
        )}

        {/* Predictive / Anomaly — narrow */}
        {topPredictive && (
          <div className="lg:col-span-5">
            <BentoCard insight={topPredictive} onAskCrystal={onAskCrystal}
              borderAccent={topPredictive.trust_score < 80 ? '#d97706' : undefined} />
          </div>
        )}

        {/* Voice topic — narrow */}
        {topVoice && (
          <div className="lg:col-span-5">
            <BentoCard insight={topVoice} onAskCrystal={onAskCrystal} />
          </div>
        )}

        {/* Prescriptive action — wide */}
        {topPrescriptive && (
          <div className={topVoice ? 'lg:col-span-7' : 'lg:col-span-12'}>
            <BentoCard insight={topPrescriptive} onAskCrystal={onAskCrystal} />
          </div>
        )}
      </div>
    </motion.section>
  );
}

function BentoCard({
  insight, onAskCrystal, borderAccent,
}: {
  insight: AgenticInsight;
  onAskCrystal: (h: string) => void;
  borderAccent?: string;
}) {
  const { t } = useTranslation();
  const layerCfg = LAYER_CONFIG[insight.layer] ?? LAYER_CONFIG.descriptive;
  return (
    <GlassCard
      className="p-6 h-full flex flex-col group"
      style={borderAccent ? { borderLeft: `4px solid ${borderAccent}` } : undefined}
    >
      <div className="flex items-center justify-between mb-3">
        <LayerBadge layer={insight.layer}
          icon={insight.layer === 'prescriptive' ? 'flag' : insight.layer === 'predictive' ? 'insights' : insight.layer === 'diagnostic' ? 'local_fire_department' : 'bar_chart'} />
        <ConfidenceChip value={insight.trust_score} />
      </div>

      <h3 className="text-base font-black font-headline leading-snug mb-2">{insight.headline}</h3>

      {insight.narrative && !/^[^:]{1,60}:\s/.test(insight.narrative) && (
        <p className="text-sm text-on-surface-variant leading-relaxed flex-1 mb-3">
          {insight.narrative.length > 180 ? insight.narrative.slice(0, 180) + '…' : insight.narrative}
        </p>
      )}

      {/* Top citation quote */}
      {insight.citations_json[0]?.quote && (
        <div className="px-3 py-2 rounded-xl mb-3 text-xs leading-relaxed italic"
          style={{ background: 'var(--color-surface-container)', borderLeft: `2px solid ${SENTIMENT_BORDER[insight.citations_json[0].sentiment] ?? 'var(--color-outline-variant)'}` }}>
          "{insight.citations_json[0].quote.slice(0, 120)}{insight.citations_json[0].quote.length > 120 ? '…' : ''}"
        </div>
      )}

      <div className="flex items-center gap-1 pt-3 border-t border-outline-variant/20">
        <button
          onClick={() => onAskCrystal(insight.headline)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-bold transition-colors hover:bg-primary/10"
          style={{ color: 'var(--color-primary)' }}>
          <Icon name="psychology" size={12} /> {t('experience.common.ask')}
        </button>
        <div className="flex-1" />
        <span className="text-[10px] text-on-surface-variant/50">{t('experience.common.citations', { n: String(insight.citations_json.length) })}</span>
      </div>
    </GlassCard>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// § 8  CRYSTAL ASK BAR (always visible inline)
// ══════════════════════════════════════════════════════════════════════════════
function CrystalAskBar({
  hasInsights, topInsight, onAsk, surveyId,
}: {
  hasInsights: boolean; topInsight: AgenticInsight | null;
  onAsk: (q: string) => void; surveyId: string;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  // Dynamic prompt chips: driven by what insights exist, all text from locale
  const chips = hasInsights && topInsight
    ? [
        { icon: 'help',         label: `Why: "${topInsight.headline.slice(0, 40)}${topInsight.headline.length > 40 ? '…' : ''}"?`, q: `Explain why: ${topInsight.headline}` },
        { icon: 'lightbulb',   label: t('experience.intelligence.askBar.chipFix'),       q: t('experience.intelligence.askBar.queryFix') },
        { icon: 'warning',     label: t('experience.intelligence.askBar.chipAnomalies'), q: t('experience.intelligence.askBar.queryAnomalies') },
        { icon: 'compare',     label: t('experience.intelligence.askBar.chipSegment'),   q: t('experience.intelligence.askBar.querySegment') },
      ]
    : [
        { icon: 'trending_down', label: t('experience.intelligence.askBar.chipDrop'),    q: t('experience.intelligence.askBar.queryDrop') },
        { icon: 'warning',       label: t('experience.intelligence.askBar.chipSegment'), q: t('experience.intelligence.askBar.querySegment') },
        { icon: 'lightbulb',     label: t('experience.intelligence.askBar.chipCsat'),    q: t('experience.intelligence.askBar.queryCsat') },
        { icon: 'compare',       label: t('experience.intelligence.askBar.chipCompare'), q: t('experience.intelligence.askBar.queryCompare') },
      ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.25 }}
    >
      <GlassCard className="p-5 holographic">
        <div className="flex items-center gap-3 mb-3 relative z-10">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
            <Icon name="psychology" size={20} style={{ color: 'white' }} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] font-black uppercase tracking-widest text-tertiary mb-0.5">{t('experience.intelligence.askBar.label')}</div>
            <form onSubmit={(e) => { e.preventDefault(); if (query.trim()) { onAsk(query); setQuery(''); } }}
              className="flex items-center gap-2">
              <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder={t('experience.intelligence.askBar.placeholder')}
                className="flex-1 text-sm bg-transparent focus:outline-none placeholder:text-on-surface-variant/50 text-on-surface" />
              <Button type="submit" size="sm"
                className="text-xs font-bold text-white border-0 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
                <Icon name="arrow_upward" size={14} /> {t('experience.intelligence.askBar.submit')}
              </Button>
            </form>
          </div>
          <kbd className="px-2 py-1 rounded bg-white/70 border border-outline-variant/30 text-xs font-bold flex-shrink-0">{t('experience.intelligence.askBar.kbd')}</kbd>
        </div>
        <div className="flex flex-wrap gap-2 relative z-10">
          {chips.map((c) => (
            <button key={c.label} onClick={() => onAsk(c.q)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-surface-container hover:bg-surface-container-high transition-colors">
              <Icon name={c.icon} size={11} style={{ color: 'var(--color-primary)' }} />
              {c.label}
            </button>
          ))}
        </div>
      </GlassCard>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// § 9  TRUST FOOTER (Cockpit trust panel)
// ══════════════════════════════════════════════════════════════════════════════
function TrustFooter({
  insights, avgTrust, lastGenerated, resCount,
}: {
  insights: AgenticInsight[]; avgTrust: number | null; lastGenerated: string | null; resCount: number;
}) {
  const { t }      = useTranslation();
  const verified   = insights.filter((i) => i.audit_json?.verifier_pass).length;
  const reliable   = insights.filter((i) => i.trust_score >= 80).length;
  const citedTotal = insights.reduce((s, i) => s + i.citations_json.length, 0);
  const lastScan   = lastGenerated ? new Date(lastGenerated).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

  return (
    <motion.footer
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="flex items-center justify-center gap-6 flex-wrap py-3 border-t border-outline-variant/20 text-xs text-on-surface-variant"
    >
      <span className="flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-emerald-500" style={{ animation: 'pulse-glow 2.5s ease-in-out infinite' }} />
        <span className="font-bold">{t('experience.intelligence.trust.live')}</span>
        {' '}·{' '}{t('experience.intelligence.trust.lastScan', { time: lastScan })}
      </span>
      <span>·</span>
      <span>{t('experience.intelligence.trust.validity')}{' '}<strong className="text-emerald-600">{t('experience.intelligence.trust.verified', { n: String(verified), total: String(insights.length) })}</strong></span>
      <span>·</span>
      <span>{t('experience.intelligence.trust.reliable', { n: String(reliable) })}</span>
      <span>·</span>
      <span>{t('experience.intelligence.trust.cited', { n: String(citedTotal), total: resCount.toLocaleString() })}</span>
      {avgTrust != null && (
        <>
          <span>·</span>
          <span>{t('experience.intelligence.trust.avgTrust')}{' '}<strong className={avgTrust >= 80 ? 'text-emerald-600' : avgTrust >= 60 ? 'text-amber-600' : 'text-on-surface-variant'}>{avgTrust}/100</strong></span>
        </>
      )}
    </motion.footer>
  );
}

// ── Mini sparkline ─────────────────────────────────────────────────────────────
function MiniSparkline({ points }: { points: number[] }) {
  if (!points.length) return null;
  const W = 200, H = 40;
  const min = Math.min(...points) - 1, max = Math.max(...points) + 1, range = max - min || 1;
  const xs = points.map((_, i) => (i / (points.length - 1)) * W);
  const ys = points.map((v) => H - ((v - min) / range) * H * 0.85 - H * 0.08);
  const d  = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-10 mt-3">
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2a4bd9" stopOpacity="0.25" />
          <stop offset="1" stopColor="#2a4bd9" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${W},${H} L0,${H} Z`} fill="url(#spark-fill)" />
      <path d={d} stroke="#2a4bd9" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Survey status badge (paused / closed / draft) ─────────────────────────────
function SurveyStatusBadge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cfg =
    status === 'paused' ? { bg: '#fef3c7', border: '#fbbf24', color: '#92400e', icon: 'pause_circle',  label: t('experience.intelligence.status.paused') } :
    status === 'closed' ? { bg: '#f1f5f9', border: '#94a3b8', color: '#475569', icon: 'lock',          label: t('experience.intelligence.status.closed') } :
                          { bg: '#f0fdf4', border: '#86efac', color: '#166534', icon: 'drafts',        label: t('experience.intelligence.status.draft') };
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-semibold"
      style={{ background: cfg.bg, borderColor: cfg.border, color: cfg.color }}>
      <Icon name={cfg.icon} size={14} />{cfg.label}
    </div>
  );
}

// ── Tier progression banner ────────────────────────────────────────────────────
type Tier = 'collecting' | 'first_voices' | 'early_signals' | 'growing_picture' | 'full_report';

// Visual-only config — text strings resolved via t() inside TierBanner
const TIER_VISUAL: Record<Exclude<Tier, 'full_report'>, {
  iconColor: string; icon: string; showGenerate: boolean; responseGoal: number | null;
}> = {
  collecting:      { iconColor: '#94a3b8', icon: 'hourglass_top', showGenerate: false, responseGoal: 10  },
  first_voices:    { iconColor: '#2a4bd9', icon: 'hearing',        showGenerate: true,  responseGoal: 40  },
  early_signals:   { iconColor: '#8329c8', icon: 'sensors',        showGenerate: true,  responseGoal: 70  },
  growing_picture: { iconColor: '#059669', icon: 'bar_chart',      showGenerate: true,  responseGoal: 100 },
};

function TierBanner({
  tier, resCount, onGenerate, isGenerating, surveyStatus,
}: {
  tier: Exclude<Tier, 'full_report'>; resCount: number;
  onGenerate: () => void; isGenerating: boolean; surveyStatus: string;
}) {
  const { t } = useTranslation();
  const visual = TIER_VISUAL[tier];
  const meta   = {
    ...visual,
    headline: t(`experience.intelligence.tierBanner.${tier}.headline`),
    sub:      t(`experience.intelligence.tierBanner.${tier}.body`),
  };
  const goal  = meta.responseGoal;
  const pct   = goal ? Math.min(100, Math.round((resCount / goal) * 100)) : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="flex items-center gap-4 px-5 py-3.5 rounded-2xl border flex-wrap"
      style={{ background: `${meta.iconColor}08`, borderColor: `${meta.iconColor}20` }}
    >
      <ProgressArc tier={tier} responseCount={resCount} size="sm" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-on-surface">{meta.headline}</span>
          <span className="text-[10px] font-mono text-on-surface-variant">
            {resCount.toLocaleString()} {t('common.responses')}{goal ? ` · ${t('experience.intelligence.tierBanner.goal', { n: String(goal) })}` : ''}
          </span>
        </div>
        <p className="text-xs text-on-surface-variant mt-0.5 max-w-xl">{meta.sub}</p>
        {goal && (
          <div className="mt-2 h-1 rounded-full bg-outline-variant/20 max-w-xs overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: `linear-gradient(to right, ${meta.iconColor}, ${meta.iconColor}99)` }} />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {meta.showGenerate && surveyStatus !== 'closed' && (
          <Button size="sm" onClick={onGenerate} disabled={isGenerating}
            className="text-xs font-bold text-white border-0"
            style={{ background: `linear-gradient(135deg, ${meta.iconColor}, #8329c8)` }}>
            {isGenerating
              ? <span className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : <Icon name="auto_awesome" size={13} />}
            {isGenerating ? t('experience.intelligence.generate.generating') : t('experience.intelligence.tierBanner.generate')}
          </Button>
        )}
        {tier === 'collecting' && (
          <Link to={ROUTES.RESPONDENTS}>
            <Button size="sm" variant="outline" className="text-xs font-bold">
              <Icon name="share" size={13} /> {t('experience.intelligence.tierBanner.share')}
            </Button>
          </Link>
        )}
      </div>
    </motion.div>
  );
}
