// Crystal Panel — the large right-side AI conversation panel for Insights.
// Default width: 55% of the content area. Expandable to 100%.
// Slides in from the right over the Insights page content.
// Wired to the Crystal hero ask bar, ⌘K shortcut, and SideNav Crystal item.

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Icon } from './Icon';
import { Button } from '@/components/ui/button';
import { useCrystalPanel, type CrystalCtx } from '../contexts/crystalPanel';
import { GlassCard, CitationChip, ConfidenceChip, SENTIMENT_BORDER } from '../pages/insights/shared';
import { useApi } from '../hooks/useApi';
import { useAppAuth } from '../lib/auth';
import type { SurveyScope } from './SurveyScopePicker';
import type { Insight, Survey, AgenticInsight, SurveyTopic } from '../types';

// Feature flag: set VITE_CRYSTAL_STREAMING=true to enable SSE streaming
const CRYSTAL_STREAMING = import.meta.env.VITE_CRYSTAL_STREAMING === 'true';

interface Message {
  id: string;
  role: 'user' | 'crystal';
  content: string;
  timestamp: Date;
  confidence?: number;
  citations?: CrystalCitation[];  // rich citation objects from streaming API
  suggestions?: string[];          // follow-up prompts from the real API
  thumbs?: 'up' | 'down' | null;
  pinned?: boolean;
}

// Citation object returned from the streaming crystal endpoint
interface CrystalCitation {
  id: string;
  quote?: string;
  sentiment?: 'positive' | 'negative' | 'neutral';
}

// Streaming state during a live SSE response
type StreamingPhase =
  | { phase: 'thinking'; tool?: string; message?: string }
  | { phase: 'observation'; tool?: string; summary?: string }
  | { phase: 'synthesizing' }
  | null;

interface CrystalPanelProps {
  scope: SurveyScope;
  surveys: Survey[];
  insights: Insight | null;
  agenticInsights?: AgenticInsight[];
  topics?: SurveyTopic[];
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

export function CrystalPanel({ scope, surveys, insights, agenticInsights = [], topics = [] }: CrystalPanelProps) {
  const { isOpen, initialQuery, crystalCtx, setCrystalCtx, closeCrystal } = useCrystalPanel();
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [streamingState, setStreamingState] = useState<StreamingPhase>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isListening, setIsListening] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const lastSubmittedQuery = useRef('');
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const api = useApi();
  const { getToken } = useAppAuth();

  const isAll = scope === 'all';
  const activeSurveys = surveys.filter((s) => s.status === 'active' && !s.deleted_at);
  const focusSurvey = !isAll ? surveys.find((s) => s.id === scope) : null;

  // Prefer real agentic NPS over legacy insights fallback
  const npsInsight = agenticInsights.find(
    (i) => i.category === 'metric.nps',
  );
  const nps = npsInsight?.metric_json?.value ?? insights?.nps_score ?? null;

  // Response count from agentic trust data or survey metadata
  const responseCount = agenticInsights[0]?.trust_json?.sample_size ?? focusSurvey?.response_count ?? 0;

  // Dynamic starter prompts: inject top topics if available
  const dynamicPrompts = !isAll && topics.length > 0
    ? [
        ...(topics[0] ? [{ icon: 'topic', label: `What's driving "${topics[0].name}"?` }] : []),
        ...(topics.find(t => (t.sentiment_score ?? 0) < -0.3)
          ? [{ icon: 'warning', label: `Why is "${topics.find(t => (t.sentiment_score ?? 0) < -0.3)!.name}" negative?` }]
          : [{ icon: 'trending_down', label: 'Why did NPS drop recently?' }]
        ),
        { icon: 'lightbulb', label: 'What should I fix first?' },
        { icon: 'emoji_events', label: 'What are customers praising most?' },
      ]
    : (isAll ? ALL_PROMPTS : SINGLE_PROMPTS);

  const WINDOW_LABELS: Record<string, string> = {
    all_time: 'All time',
    '30d': 'Last 30 days',
    '7d': 'Last 7 days',
  };

  const submitQuery = useCallback(
    async (query: string, overrideCtx?: CrystalCtx) => {
      if (!query.trim() || isThinking) return;
      lastSubmittedQuery.current = query;
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'user', content: query.trim(), timestamp: new Date() },
      ]);
      setIsThinking(true);
      setStreamingState(null);
      setStreamError(null);

      // All-surveys scope: no surveyId to call against
      if (isAll) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'crystal',
            content: 'Select a specific survey from the scope picker to get real AI-powered answers. Crystal works best when focused on a single survey\'s responses.',
            timestamp: new Date(),
            suggestions: ['Switch to a specific survey →'],
          },
        ]);
        setIsThinking(false);
        return;
      }

      const activeCtx = overrideCtx ?? crystalCtx;

      // ── Streaming path (VITE_CRYSTAL_STREAMING=true) ──────────────────────
      if (CRYSTAL_STREAMING) {
        try {
          const token = await getToken();
          const BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001';
          const response = await fetch(
            `${BASE}/api/experience/${scope}/crystal/stream`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                survey_id: scope,
                message: query.trim(),
                insights: agenticInsights ?? [],
                topics: topics ?? [],
                survey_title: focusSurvey?.title ?? '',
                survey_response_count: responseCount ?? 0,
                metrics: {},
                conversation_history: messages
                  .filter((m) => m.role !== 'user' || true) // include all
                  .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.content })),
                scope: 'survey',
                window: activeCtx.window,
                focused_topic: activeCtx.focused_topic,
              }),
            },
          );

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          if (!reader) throw new Error('No response stream');

          let buffer = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            // Process complete SSE lines from the buffer
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const data = line.slice(6).trim();
              if (data === '[DONE]') break;
              try {
                const event = JSON.parse(data) as {
                  type: string;
                  tool?: string;
                  message?: string;
                  summary?: string;
                  answer?: string;
                  citations?: Array<{ id: string; quote?: string; sentiment?: 'positive' | 'negative' | 'neutral' }>;
                  suggestions?: string[];
                };
                if (event.type === 'thinking') {
                  setStreamingState({ phase: 'thinking', tool: event.tool, message: event.message });
                } else if (event.type === 'observation') {
                  setStreamingState({ phase: 'observation', tool: event.tool, summary: event.summary });
                } else if (event.type === 'synthesizing') {
                  setStreamingState({ phase: 'synthesizing' });
                } else if (event.type === 'answer') {
                  setStreamingState(null);
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      role: 'crystal',
                      content: event.answer ?? '',
                      timestamp: new Date(),
                      citations: event.citations ?? [],
                      suggestions: event.suggestions ?? [],
                    },
                  ]);
                } else if (event.type === 'error') {
                  setStreamingState(null);
                  setStreamError(event.message ?? 'An error occurred');
                  setMessages((prev) => [
                    ...prev,
                    {
                      id: crypto.randomUUID(),
                      role: 'crystal',
                      content: event.message ?? 'Something went wrong. Please try again.',
                      timestamp: new Date(),
                    },
                  ]);
                }
              } catch {
                // ignore malformed SSE lines
              }
            }
          }
        } catch (err) {
          const isServiceDown = err instanceof Error && (
            err.message.includes('fetch') || err.message.includes('503') || err.message.includes('502')
          );
          setStreamingState(null);
          setMessages((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              role: 'crystal',
              content: isServiceDown
                ? 'The agents service isn\'t reachable right now. Make sure it\'s running and try again.'
                : 'Something went wrong. Please try your question again.',
              timestamp: new Date(),
            },
          ]);
        } finally {
          setIsThinking(false);
          setStreamingState(null);
        }
        return;
      }

      // ── Legacy path ────────────────────────────────────────────────────────
      try {
        const { answer, suggestions, insight_refs } = await api.crystalChat(scope, query, {
          window: activeCtx.window,
          focused_topic: activeCtx.focused_topic,
        });
        // Map legacy string refs to CrystalCitation objects
        const citations: CrystalCitation[] = (insight_refs ?? []).map((id) => ({ id }));
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'crystal',
            content: answer,
            timestamp: new Date(),
            citations,
            suggestions,
          },
        ]);
      } catch (err) {
        const isServiceDown = err instanceof Error && (
          err.message.includes('fetch') || err.message.includes('503') || err.message.includes('502')
        );
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'crystal',
            content: isServiceDown
              ? 'The agents service isn\'t reachable right now. Make sure it\'s running on :8001 and try again.'
              : 'Something went wrong. Please try your question again.',
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsThinking(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isAll, isThinking, api, scope, crystalCtx, getToken, agenticInsights, topics, focusSurvey, responseCount, messages],
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

  const handleMic = useCallback(() => {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) return;

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognitionRef.current = recognition;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(prev => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognition.start();
    setIsListening(true);
  }, [isListening]);

  const handlePin = useCallback((id: string) => {
    setMessages(prev => prev.map(m => m.id === id ? { ...m, pinned: !m.pinned } : m));
  }, []);

  const handleThumbsUp = useCallback((id: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== id) return m;
      const newThumbs = m.thumbs === 'up' ? null : 'up';
      // Persist to all cited insight IDs (fire-and-forget)
      if (!isAll && m.citations?.length) {
        m.citations.forEach(c => {
          api.updateInsightFeedback(c.id, { thumbs: newThumbs }).catch(() => {});
        });
      }
      return { ...m, thumbs: newThumbs };
    }));
  }, [api, isAll]);

  const handleThumbsDown = useCallback((id: string) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== id) return m;
      const newThumbs = m.thumbs === 'down' ? null : 'down';
      // Persist to all cited insight IDs (fire-and-forget)
      if (!isAll && m.citations?.length) {
        m.citations.forEach(c => {
          api.updateInsightFeedback(c.id, { thumbs: newThumbs }).catch(() => {});
        });
      }
      return { ...m, thumbs: newThumbs };
    }));
  }, [api, isAll]);

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
                    ? `Ask across ${activeSurveys.length} active surveys${nps != null ? ` · Portfolio NPS ${nps}` : ''}`
                    : focusSurvey
                      ? `${focusSurvey.title} · ${responseCount.toLocaleString()} responses${nps != null ? ` · NPS ${nps}` : ''}${topics.length > 0 ? ` · ${topics.length} topics` : ''}`
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

            {/* ── Context strip — shows what Crystal is scoped to ──────── */}
            {!isAll && (crystalCtx.window || crystalCtx.focused_topic) && (
              <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2 flex-wrap"
                style={{ background: 'rgba(42,75,217,0.04)', borderBottom: '1px solid rgba(42,75,217,0.08)' }}>
                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mr-1">
                  Scoped to:
                </span>
                {crystalCtx.window && crystalCtx.window !== 'all_time' && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: '#eef2ff', color: '#4f46e5' }}>
                    <Icon name="schedule" size={11} />
                    {WINDOW_LABELS[crystalCtx.window] ?? crystalCtx.window}
                  </span>
                )}
                {crystalCtx.focused_topic && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1"
                    style={{ background: '#ecfdf5', color: '#059669' }}>
                    <Icon name="topic" size={11} />
                    {crystalCtx.focused_topic}
                  </span>
                )}
                <button className="ml-auto text-[10px] text-on-surface-variant hover:text-on-surface"
                  onClick={() => setCrystalCtx({})}>
                  clear
                </button>
              </div>
            )}

            {/* ── Time window quick-filter ──────────────────────────────── */}
            {!isAll && messages.length === 0 && (
              <div className="flex-shrink-0 flex items-center gap-1.5 px-5 pt-3 pb-0">
                <span className="text-[10px] text-on-surface-variant font-semibold mr-1">Window:</span>
                {(['all_time', '30d', '7d'] as const).map(w => (
                  <button key={w}
                    onClick={() => setCrystalCtx({ ...crystalCtx, window: w })}
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full transition-all"
                    style={{
                      background: (crystalCtx.window ?? 'all_time') === w ? '#4f46e5' : 'rgba(0,0,0,0.06)',
                      color: (crystalCtx.window ?? 'all_time') === w ? '#fff' : '#64748b',
                    }}>
                    {WINDOW_LABELS[w]}
                  </button>
                ))}
              </div>
            )}

            {/* ── Conversation ───────────────────────────────────────────── */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto overscroll-contain"
              style={{ scrollBehavior: 'smooth' }}
            >
              {messages.length === 0 && !isThinking ? (
                <EmptyState
                  prompts={dynamicPrompts}
                  isAll={isAll}
                  onPromptClick={(p) => submitQuery(p)}
                />
              ) : (
                <div className="px-5 py-5 space-y-5">
                  {messages.map((msg) =>
                    msg.role === 'user' ? (
                      <UserBubble key={msg.id} message={msg} />
                    ) : (
                      <CrystalBubble
                        key={msg.id}
                        message={msg}
                        onFollowUp={submitQuery}
                        onPin={handlePin}
                        onThumbsUp={handleThumbsUp}
                        onThumbsDown={handleThumbsDown}
                      />
                    ),
                  )}
                  {isThinking && (
                    streamingState
                      ? <StreamingBubble state={streamingState} />
                      : <ThinkingBubble />
                  )}
                  {streamError && !isThinking && (
                    <div className="text-xs text-red-500 px-2">{streamError}</div>
                  )}
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
                <button
                  className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 self-end mb-0.5 hover:bg-primary/10 transition-colors"
                  onClick={handleMic}
                  title={isListening ? 'Stop listening' : 'Speak your question'}
                  style={isListening ? { background: 'rgba(220,38,38,0.1)', color: '#dc2626' } : undefined}
                >
                  <Icon name={isListening ? 'mic_off' : 'mic'} size={18} className={isListening ? '' : 'text-on-surface-variant'} />
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
  prompts: Array<{ icon: string; label: string }>;
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
function CrystalBubble({
  message,
  onFollowUp,
  onPin,
  onThumbsUp,
  onThumbsDown,
}: {
  message: Message;
  onFollowUp: (q: string) => void;
  onPin: (id: string) => void;
  onThumbsUp: (id: string) => void;
  onThumbsDown: (id: string) => void;
}) {
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
          {message.pinned && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full flex items-center gap-0.5"
              style={{ background: '#eef2ff', color: '#4f46e5' }}>
              <Icon name="push_pin" size={10} fill={1} /> Pinned
            </span>
          )}
          {message.confidence !== undefined && <ConfidenceChip value={message.confidence} />}
        </div>
        <p className="text-sm leading-relaxed mb-3">{message.content}</p>
        {message.citations && message.citations.length > 0 && (
          <div className="flex flex-col gap-1.5 mt-3 pt-3 border-t border-outline-variant/20">
            <span className="text-[10px] text-on-surface-variant font-bold">Sources</span>
            {/* Verbatim quote citations with sentiment border */}
            {message.citations.filter(c => c.quote).map((c) => (
              <div
                key={c.id}
                className="px-3 py-2 rounded-lg bg-muted/50 text-xs leading-relaxed"
                style={{
                  borderLeft: `3px solid ${
                    c.sentiment === 'positive' ? SENTIMENT_BORDER.positive
                    : c.sentiment === 'negative' ? SENTIMENT_BORDER.negative
                    : SENTIMENT_BORDER.neutral
                  }`,
                }}
              >
                &ldquo;{c.quote}&rdquo;
              </div>
            ))}
            {/* ID-only citations as chips */}
            {message.citations.filter(c => !c.quote).length > 0 && (
              <div className="flex flex-wrap gap-1">
                {message.citations.filter(c => !c.quote).map((c) => (
                  <CitationChip key={c.id} id={c.id} />
                ))}
              </div>
            )}
          </div>
        )}
        {message.suggestions && message.suggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-outline-variant/20">
            {message.suggestions.map((s) => (
              <button
                key={s}
                onClick={() => onFollowUp(s)}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-primary/30 text-primary hover:bg-primary/5 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            variant={message.pinned ? 'default' : 'outline'}
            className="text-xs"
            onClick={() => onPin(message.id)}
            title={message.pinned ? 'Unpin this response' : 'Pin this response'}
            style={message.pinned ? { background: '#4f46e5', color: '#fff' } : undefined}
          >
            <Icon name="push_pin" size={13} fill={message.pinned ? 1 : 0} />
            {message.pinned ? 'Pinned' : 'Pin'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            title="Slack integration coming soon"
            onClick={() => {/* Slack integration — not yet connected */}}
          >
            <Icon name="ios_share" size={13} /> Slack
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="text-xs"
            title="Ticketing integration coming soon"
            onClick={() => {/* Ticketing integration — not yet connected */}}
          >
            <Icon name="flag" size={13} /> Ticket
          </Button>
          <div className="flex-1" />
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => onThumbsUp(message.id)}
            title="Good answer"
            style={message.thumbs === 'up' ? { color: '#059669', background: '#d1fae5' } : undefined}
          >
            <Icon name="thumb_up" size={13} fill={message.thumbs === 'up' ? 1 : 0} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="w-7 h-7"
            onClick={() => onThumbsDown(message.id)}
            title="Needs improvement"
            style={message.thumbs === 'down' ? { color: '#b41340', background: '#fee2e2' } : undefined}
          >
            <Icon name="thumb_down" size={13} fill={message.thumbs === 'down' ? 1 : 0} />
          </Button>
        </div>
      </GlassCard>
    </div>
  );
}

// ── Streaming status bubble — shown during SSE streaming phases ───────────────
function StreamingBubble({ state }: { state: NonNullable<StreamingPhase> }) {
  return (
    <div className="flex gap-3">
      <div
        className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center"
        style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
      >
        <Icon name="diamond" size={14} style={{ color: 'white' }} />
      </div>
      <GlassCard className="rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-3 flex-1">
        {state.phase === 'thinking' && (
          <>
            <Icon name="psychology" size={16} className="text-primary animate-spin" style={{ animation: 'spin 2s linear infinite' }} />
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary block mb-0.5">Crystal · Thinking</span>
              <p className="text-xs text-on-surface-variant truncate">
                {state.tool ? `Using ${state.tool}…` : state.message ?? 'Reasoning…'}
              </p>
            </div>
          </>
        )}
        {state.phase === 'observation' && (
          <>
            <Icon name="search" size={16} className="text-amber-600" />
            <div className="min-w-0">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 block mb-0.5">
                {state.tool ? `Observed · ${state.tool}` : 'Observation'}
              </span>
              <p className="text-xs text-on-surface-variant truncate">{state.summary ?? 'Processing results…'}</p>
            </div>
          </>
        )}
        {state.phase === 'synthesizing' && (
          <>
            <div
              className="w-4 h-4 rounded-full border-2 flex-shrink-0"
              style={{
                borderColor: 'rgba(42,75,217,0.2)',
                borderTopColor: 'var(--color-primary, #2a4bd9)',
                animation: 'spin 1s linear infinite',
              }}
            />
            <div>
              <span className="text-[10px] font-bold uppercase tracking-widest text-tertiary block mb-0.5">Crystal</span>
              <p className="text-xs text-on-surface-variant">Putting it together…</p>
            </div>
          </>
        )}
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

// Removed: MiniNPSChart (was hardcoded fake data tied to buildDemoResponse)
// Removed: buildDemoResponse (was returning identical hardcoded text for any unrecognized query)
// Crystal now calls the real /api/insights/:surveyId/crystal endpoint.

