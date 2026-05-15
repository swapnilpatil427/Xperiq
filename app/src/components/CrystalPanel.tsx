// Crystal Panel — the large right-side AI conversation panel for Insights.
// Default width: 55% of the content area. Expandable to 100%.
// Slides in from the right over the Insights page content.
// Wired to the Crystal hero ask bar, ⌘K shortcut, and SideNav Crystal item.

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';
import { Button } from '@/components/ui/button';
import { useCrystalPanel } from '../contexts/crystalPanel';
import { GlassCard, CitationChip, ConfidenceChip } from '../pages/insights/shared';
import type { SurveyScope } from './SurveyScopePicker';
import type { Insight, Survey } from '../types';

interface Message {
  id: string;
  role: 'user' | 'crystal';
  content: string;
  timestamp: Date;
  confidence?: number;
  citations?: string[];
  showMiniChart?: boolean;
}

interface CrystalPanelProps {
  scope: SurveyScope;
  surveys: Survey[];
  insights: Insight | null;
}

const SINGLE_PROMPTS = [
  { icon: 'trending_down', label: 'Why did NPS drop May 10?' },
  { icon: 'warning', label: 'Highest churn-risk segment?' },
  { icon: 'lightbulb', label: 'What would raise CSAT most?' },
  { icon: 'compare', label: 'Compare to last quarter' },
];

const ALL_PROMPTS = [
  { icon: 'compare', label: 'Which survey has highest churn risk?' },
  { icon: 'trending_up', label: 'Themes appearing in 3+ surveys' },
  { icon: 'balance', label: 'Are surveys over-sampling one segment?' },
  { icon: 'lightbulb', label: 'Top portfolio action right now?' },
];

export function CrystalPanel({ scope, surveys, insights }: CrystalPanelProps) {
  const { isOpen, initialQuery, closeCrystal } = useCrystalPanel();
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSubmittedQuery = useRef('');

  const isAll = scope === 'all';
  const activeSurveys = surveys.filter((s) => s.status === 'active' && !s.deleted_at);
  const focusSurvey = !isAll ? surveys.find((s) => s.id === scope) : null;
  const nps = insights?.nps_score ?? (isAll ? 51 : 47);
  const prompts = isAll ? ALL_PROMPTS : SINGLE_PROMPTS;

  const submitQuery = useCallback(
    (query: string) => {
      if (!query.trim() || isThinking) return;
      lastSubmittedQuery.current = query;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: query.trim(), timestamp: new Date() },
      ]);
      setIsThinking(true);

      // Simulated Crystal response — replace with /api/insights/ask in v1.1
      setTimeout(() => {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'crystal',
            content: buildDemoResponse(query, isAll),
            timestamp: new Date(),
            confidence: 84,
            citations: ['r2104', 'r2107', 'r1492'],
            showMiniChart:
              query.toLowerCase().includes('nps') &&
              (query.toLowerCase().includes('drop') || query.toLowerCase().includes('dip')),
          },
        ]);
        setIsThinking(false);
      }, 1800);
    },
    [isAll, isThinking],
  );

  // Auto-submit when panel opens with a pre-loaded query
  useEffect(() => {
    if (isOpen && initialQuery && initialQuery !== lastSubmittedQuery.current) {
      setInput('');
      submitQuery(initialQuery);
    }
  }, [isOpen, initialQuery, submitQuery]);

  // Auto-scroll to latest message
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isThinking]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      const timer = setTimeout(() => inputRef.current?.focus(), 350);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Reset expanded state when closed
  useEffect(() => {
    if (!isOpen) setIsExpanded(false);
  }, [isOpen]);

  const handleSubmit = () => {
    if (input.trim()) {
      submitQuery(input.trim());
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const panelWidth = isExpanded
    ? 'calc((100vw - var(--sidebar-width)) * 0.55)'
    : 'calc((100vw - var(--sidebar-width)) * 0.28)';

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Subtle directional shadow on the left edge of the panel — non-interactive */}
          {!isExpanded && (
            <motion.div
              key="crystal-shadow"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="fixed z-40 pointer-events-none"
              style={{
                top: '4rem',
                bottom: 0,
                right: 'calc((100vw - var(--sidebar-width)) * 0.28)',
                width: 64,
                background:
                  'linear-gradient(to right, transparent, rgba(42,75,217,0.06) 50%, rgba(42,75,217,0.10))',
              }}
            />
          )}

          {/* Panel */}
          <motion.div
            key="crystal-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="fixed z-50 flex flex-col"
            style={{
              top: '4rem',
              bottom: 0,
              right: 0,
              width: panelWidth,
              borderLeft: '1px solid rgba(42,75,217,0.18)',
              background: 'var(--surface, #fff)',
              boxShadow: '-8px 0 40px rgba(0,0,0,0.10), -2px 0 8px rgba(42,75,217,0.07)',
              transition: 'width 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div
              className="flex-shrink-0 flex items-center gap-3 px-5 py-3.5 border-b"
              style={{
                borderColor: 'rgba(42,75,217,0.12)',
                background:
                  'linear-gradient(to bottom, rgba(42,75,217,0.035) 0%, transparent 100%)',
              }}
            >
              {/* Crystal gem icon */}
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
              >
                <Icon name="diamond" size={16} style={{ color: 'white' }} />
              </div>

              {/* Title + scope context strip */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 leading-none mb-0.5">
                  <span className="font-black text-sm text-on-surface">Crystal</span>
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(42,75,217,0.08)', color: '#2a4bd9' }}
                  >
                    Experient Copilot
                  </span>
                </div>
                <div className="text-[10px] text-on-surface-variant truncate">
                  {isAll
                    ? `Ask across ${activeSurveys.length} active surveys · Portfolio NPS ${nps}`
                    : focusSurvey
                      ? `${focusSurvey.title} · ${(focusSurvey.response_count ?? 0).toLocaleString()} responses · NPS ${nps}`
                      : 'Ask anything about this survey'}
                </div>
              </div>

              {/* Clear conversation */}
              {messages.length > 0 && (
                <button
                  onClick={() => setMessages([])}
                  className="text-[10px] font-bold text-on-surface-variant hover:text-on-surface flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-muted transition-colors"
                  title="Clear conversation"
                >
                  <Icon name="delete_sweep" size={14} />
                  Clear
                </button>
              )}

              {/* Expand / collapse */}
              <button
                onClick={() => setIsExpanded((e) => !e)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-primary/10 hover:text-primary transition-colors flex-shrink-0"
                title={isExpanded ? 'Collapse panel' : 'Expand panel'}
              >
                <Icon name={isExpanded ? 'close_fullscreen' : 'open_in_full'} size={16} />
              </button>

              {/* Close */}
              <button
                onClick={closeCrystal}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-on-surface-variant hover:bg-red-50 hover:text-red-500 transition-colors flex-shrink-0"
                title="Close Crystal (⌘K)"
              >
                <Icon name="close" size={16} />
              </button>
            </div>

            {/* ── Conversation ───────────────────────────────────────────── */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ scrollBehavior: 'smooth' }}
            >
              {messages.length === 0 && !isThinking ? (
                <EmptyState
                  prompts={prompts}
                  isAll={isAll}
                  onPromptClick={(p) => submitQuery(p)}
                />
              ) : (
                <div className="px-5 py-5 space-y-5">
                  {messages.map((msg) =>
                    msg.role === 'user' ? (
                      <UserBubble key={msg.id} message={msg} />
                    ) : (
                      <CrystalBubble key={msg.id} message={msg} />
                    ),
                  )}
                  {isThinking && <ThinkingBubble />}
                </div>
              )}
            </div>

            {/* ── Input bar ──────────────────────────────────────────────── */}
            <div
              className="flex-shrink-0 px-4 py-3 border-t"
              style={{ borderColor: 'rgba(42,75,217,0.1)' }}
            >
              <div
                className="flex items-end gap-2 p-2 rounded-xl"
                style={{
                  background: 'rgba(42,75,217,0.04)',
                  border: '1px solid rgba(42,75,217,0.14)',
                }}
              >
                <button className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 self-end mb-0.5 hover:bg-primary/10 transition-colors">
                  <Icon name="mic" size={18} className="text-on-surface-variant" />
                </button>
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-grow
                    e.target.style.height = 'auto';
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
                  }}
                  onKeyDown={handleKeyDown}
                  placeholder={
                    isAll
                      ? 'Ask anything across your surveys…'
                      : 'Ask anything about this survey…'
                  }
                  rows={1}
                  className="flex-1 bg-transparent resize-none focus:outline-none text-sm text-on-surface placeholder:text-on-surface-variant/50 py-1.5 px-1 overflow-y-auto"
                  style={{ lineHeight: '1.55', maxHeight: 128 }}
                />
                <Button
                  size="sm"
                  onClick={handleSubmit}
                  disabled={!input.trim() || isThinking}
                  className="flex-shrink-0 font-bold text-white border-0 self-end text-xs"
                  style={{
                    background:
                      !input.trim() || isThinking
                        ? undefined
                        : 'linear-gradient(135deg, #2a4bd9, #8329c8)',
                  }}
                >
                  <Icon name="arrow_upward" size={15} />
                  Ask
                </Button>
              </div>
              <p className="text-[10px] text-on-surface-variant text-center mt-2">
                ⌘K to close · Shift+Enter for new line · Every answer cites real responses
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Empty state — shown before any messages ───────────────────────────────────
function EmptyState({
  prompts,
  isAll,
  onPromptClick,
}: {
  prompts: typeof SINGLE_PROMPTS;
  isAll: boolean;
  onPromptClick: (p: string) => void;
}) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 py-10">
      <MiniCrystal />
      <div className="text-[10px] font-black uppercase tracking-[0.2em] text-tertiary mb-2 mt-5">
        Crystal · Experient Copilot
      </div>
      <p className="font-black text-sm text-on-surface mb-1">
        {isAll ? 'Ask anything across your surveys' : 'Ask anything about this survey'}
      </p>
      <p className="text-xs text-on-surface-variant mb-7 max-w-xs">
        Every answer cites real customer quotes. Numbers come from analytics — not the LLM.
      </p>
      <div className="w-full max-w-sm space-y-2">
        {prompts.map((p) => (
          <button
            key={p.label}
            onClick={() => onPromptClick(p.label)}
            className="w-full text-left px-4 py-3 rounded-xl text-sm font-medium flex items-center gap-3 transition-all hover:bg-primary/8 border border-border/40 hover:border-primary/25 group"
          >
            <Icon name={p.icon} size={16} className="text-primary/70 group-hover:text-primary flex-shrink-0" />
            <span className="flex-1">{p.label}</span>
            <Icon
              name="arrow_forward"
              size={14}
              className="text-on-surface-variant/50 group-hover:text-primary flex-shrink-0 transition-colors"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Mini Crystal centerpiece (for empty state) ────────────────────────────────
function MiniCrystal() {
  return (
    <>
      <style>{`
        @keyframes spin-crystal-panel {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
      `}</style>
      <div
        className="relative mx-auto"
        style={{
          width: 64,
          height: 64,
          filter: 'drop-shadow(0 8px 20px rgba(42,75,217,0.3))',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background:
              'conic-gradient(from 0deg at 50% 50%, #879aff 0%, #d299ff 25%, #82deff 50%, #d299ff 75%, #879aff 100%)',
            clipPath: 'polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)',
            animation: 'spin-crystal-panel 20s linear infinite',
            filter: 'blur(0.5px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '20%',
            background:
              'conic-gradient(from 180deg at 50% 50%, #ffffff 0%, #879aff 33%, #d299ff 66%, #ffffff 100%)',
            clipPath: 'polygon(50% 0%, 100% 30%, 100% 70%, 50% 100%, 0% 70%, 0% 30%)',
            animation: 'spin-crystal-panel 10s linear infinite reverse',
            opacity: 0.75,
          }}
        />
        <div
          style={{
            position: 'absolute',
            inset: '38%',
            background: 'radial-gradient(circle, #ffffff, #82deff)',
            borderRadius: '50%',
            filter: 'blur(3px)',
            animation: 'pulse-glow 2.5s ease-in-out infinite',
          }}
        />
      </div>
    </>
  );
}

// ── User message bubble ───────────────────────────────────────────────────────
function UserBubble({ message }: { message: Message }) {
  return (
    <div className="flex justify-end">
      <div
        className="rounded-2xl rounded-br-sm px-4 py-3 max-w-[85%] text-white"
        style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
      >
        <div className="text-[10px] font-bold uppercase tracking-widest opacity-70 mb-0.5">You</div>
        <div className="text-sm font-medium leading-relaxed">{message.content}</div>
      </div>
    </div>
  );
}

// ── Crystal answer bubble ─────────────────────────────────────────────────────
function CrystalBubble({ message }: { message: Message }) {
  return (
    <div className="flex gap-3">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5"
        style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
      >
        <Icon name="diamond" size={14} style={{ color: 'white' }} />
      </div>
      <GlassCard className="rounded-2xl rounded-bl-sm px-4 py-4 flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Crystal</span>
          {message.confidence !== undefined && <ConfidenceChip value={message.confidence} />}
        </div>
        <p className="text-sm leading-relaxed mb-3">{message.content}</p>
        {message.showMiniChart && <MiniNPSChart />}
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 mt-3 pt-3 border-t border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant font-bold mr-1">Sources</span>
            {message.citations.map((c) => (
              <CitationChip key={c} id={c} />
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <Button size="sm" variant="outline" className="text-xs">
            <Icon name="push_pin" size={13} /> Pin
          </Button>
          <Button size="sm" variant="outline" className="text-xs">
            <Icon name="ios_share" size={13} /> Slack
          </Button>
          <Button size="sm" variant="outline" className="text-xs">
            <Icon name="flag" size={13} /> Ticket
          </Button>
          <div className="flex-1" />
          <Button size="icon" variant="ghost" className="w-7 h-7">
            <Icon name="thumb_up" size={13} />
          </Button>
          <Button size="icon" variant="ghost" className="w-7 h-7">
            <Icon name="thumb_down" size={13} />
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Thinking animation ────────────────────────────────────────────────────────
function ThinkingBubble() {
  return (
    <>
      <style>{`
        @keyframes thinking-dot {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
      <div className="flex gap-3">
        <div
          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
          style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
        >
          <Icon name="diamond" size={14} style={{ color: 'white' }} />
        </div>
        <GlassCard className="rounded-2xl rounded-bl-sm px-4 py-4 flex items-center gap-3">
          <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary">Crystal</span>
          <div className="flex items-center gap-1.5">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="w-2 h-2 rounded-full bg-primary"
                style={{ animation: `thinking-dot 1.2s ease-in-out ${i * 0.2}s infinite` }}
              />
            ))}
          </div>
        </GlassCard>
      </div>
    </>
  );
}

// ── NPS mini chart (shown for NPS-drop questions) ────────────────────────────
function MiniNPSChart() {
  return (
    <div className="rounded-xl p-3 bg-muted/50 mb-3">
      <div className="text-[10px] font-bold text-on-surface-variant mb-2 uppercase tracking-widest">
        NPS · May 7 – May 14
      </div>
      <div className="flex items-end justify-between gap-1.5 h-14">
        {[62, 65, 58, 25, 35, 54, 60].map((h, i) => (
          <div key={i} className="flex-1 relative">
            <div
              className="w-full rounded-t"
              style={{
                height: `${h}%`,
                background:
                  i === 3 ? '#d97706' : i === 4 ? 'rgba(217,119,6,0.55)' : 'rgba(42,75,217,0.55)',
              }}
            />
            {i === 3 && (
              <span className="absolute -top-4 left-1/2 -translate-x-1/2 text-[9px] font-black text-amber-600">
                35
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-1 text-[9px] text-on-surface-variant font-bold">
        <span>May 7</span>
        <span>May 10 ▲</span>
        <span>May 14</span>
      </div>
    </div>
  );
}

// ── Demo response generator (replace with /api/insights/ask in v1.1) ─────────
function buildDemoResponse(query: string, isAll: boolean): string {
  const q = query.toLowerCase();
  if (q.includes('nps') && (q.includes('drop') || q.includes('dip'))) {
    return 'NPS dropped 12 points (47 → 35) on May 10, outside the 95% prediction interval [42–52]. A spike of 14 responses mentioning "login error" hit in the same 24h window, and average sentiment moved from +0.12 to −0.41 (p<0.01). Likely root cause: the 2026-05-10 14:12 UTC login outage.';
  }
  if (q.includes('churn')) {
    return 'Highest churn-risk segment: Enterprise tier, onboarding cohort (< 30 days old). 23% are detractors vs. 11% baseline. Primary driver: "email verification loop" appears in 67% of their negative verbatims. Recommended action: route this segment to priority support.';
  }
  if (q.includes('csat') || q.includes('raise')) {
    return 'The single highest-leverage action to raise CSAT: fix the email verification loop. Projected CSAT lift +0.3 points, NPS +3.2 ±1.8. Cited by 24 respondents across 3 surveys. This sits in the top-right quadrant of impact × feasibility.';
  }
  if (q.includes('last quarter') || q.includes('compare')) {
    return 'vs. last quarter: NPS +4 pts (47 vs. 43), CSAT flat (4.2 vs. 4.1). Response velocity is 2.3× higher this quarter — likely attributed to your email campaign. The onboarding friction cluster is new this quarter (was absent Q1); all other top-5 drivers are stable.';
  }
  if (isAll && (q.includes('theme') || q.includes('3+'))) {
    return 'Three themes appear in 4+ of your surveys: (1) "pricing transparency" — 4 surveys; (2) "onboarding friction" — 4 surveys; (3) "support response time" — 3 surveys. These are your highest-confidence portfolio signals. Addressing pricing transparency is projected to lift portfolio NPS by +1.4 ±0.7.';
  }
  if (isAll && q.includes('segment')) {
    return '73% of responses across your portfolio are from Enterprise tier. This over-represents NPS for that segment and under-represents SMB (17% of responses vs. ~40% of ARR). Recommend post-stratification weighting or a dedicated SMB survey track.';
  }
  if (isAll && q.includes('portfolio')) {
    return 'Top portfolio action: fix the email verification loop — it appears as a top driver in 3 of your 7 active surveys. Single change projected to lift portfolio NPS +1.4 ±0.7. Second: improve first-response SLA in support (currently 6h, benchmark 2h).';
  }
  return `Based on current data across ${isAll ? 'your portfolio' : 'this survey'}: support response time is the #1 driver of detractor sentiment (31% of explained NPS variance). Fixing the email verification loop is projected to add +3.2 NPS points and is the highest-confidence action this week.`;
}
