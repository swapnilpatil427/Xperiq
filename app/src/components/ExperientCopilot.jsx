import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './Icon';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

const BUILDER_COMMANDS = [
  'Add a follow-up "why?" after the first question',
  'Reorder questions by difficulty level',
  'Make all questions required',
  'Add skip logic: if NPS < 7, jump to last question',
  'Add a demographic question at the end',
];
const GENERIC_COMMANDS = [
  'Add a multiple choice question about pricing',
  'Make all questions required',
  'Add a follow-up open text question',
  'Add skip logic to the first question',
];

function buildGreeting({ surveyTitle, questionCount, surveyType, surveySettings, templateInfo }) {
  const type = surveyType || templateInfo?.label;
  const desc = surveySettings?.intent || surveySettings?.description;
  if (questionCount) {
    let msg = `I'm looking at your${type ? ` ${type}` : ''} survey "${surveyTitle || 'Untitled'}" — ${questionCount} question${questionCount !== 1 ? 's' : ''}.`;
    if (desc) msg += ` Goal: ${desc.slice(0, 80)}${desc.length > 80 ? '…' : ''}`;
    msg += ' Tell me what to change and I\'ll apply it instantly.';
    return msg;
  }
  return `Hi, I'm your Experient Copilot. Tell me what you'd like to do and I'll handle it.`;
}

// onAction is scaffolded for future UI commands (open panels, highlight questions, etc.)
export function ExperientCopilot({ context = {}, onRefine, onAction, quickCommands }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    { role: 'ai', text: buildGreeting(context) },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const commands = quickCommands || (context.isBuilder ? BUILDER_COMMANDS : GENERIC_COMMANDS);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((o) => !o);
      }
      if (e.key === 'Escape' && isOpen) setIsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const send = useCallback(async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading || !onRefine) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const result = await onRefine(msg);
      // Scaffold: if the result includes actions, dispatch them to the page
      if (result?.actions?.length && onAction) {
        result.actions.forEach((action) => onAction(action));
      }
      const count = result?.questions?.length;
      const explanation = result?.explanation
        || (count ? `✓ Applied — survey updated to ${count} question${count !== 1 ? 's' : ''}.` : '✓ Done! Changes applied.');
      setMessages((prev) => [...prev, { role: 'ai', text: explanation }]);
      if (!isOpen) setUnread((u) => u + 1);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
      if (isOpen) setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [input, loading, onRefine, onAction, isOpen]);

  const hasContext = context.surveyTitle || context.questionCount != null;

  return (
    <>
      {/* Bubble */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-2.5">
        <AnimatePresence>
          {!isOpen && messages.length <= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ delay: 1.5, duration: 0.18 }}
              onClick={() => setIsOpen(true)}
              className="cursor-pointer bg-white rounded-2xl px-3.5 py-2.5 flex items-center gap-2"
              style={{ boxShadow: '0 4px 16px rgba(42,75,217,0.12)', border: '1px solid rgba(42,75,217,0.1)' }}
            >
              <span className="text-xs font-black"
                style={{ background: 'linear-gradient(135deg, #4f6ef7, #9b51e0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                Experient Copilot
              </span>
              <kbd className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#f3f4f6] text-[#6b7280] border border-[#e5e7eb]">⌘K</kbd>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsOpen((o) => !o)}
          title="Experient Copilot (⌘K)"
          className="relative w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #4f6ef7, #9b51e0)', boxShadow: '0 6px 24px rgba(79,110,247,0.38)' }}
          aria-label="Open Experient Copilot"
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={isOpen ? 'x' : 'spark'}
              initial={{ scale: 0, rotate: -80 }}
              animate={{ scale: 1, rotate: 0 }}
              exit={{ scale: 0, rotate: 80 }}
              transition={{ duration: 0.14 }}
              className="flex items-center justify-center"
            >
              <Icon name={isOpen ? 'close' : 'auto_awesome'} fill={1} size={24} style={{ color: 'white' }} />
            </motion.span>
          </AnimatePresence>
          {unread > 0 && !isOpen && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-error text-white text-[10px] font-black flex items-center justify-center">
              {unread}
            </span>
          )}
        </button>
      </div>

      {/* Drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: 'rgba(0,0,0,0.18)' }}
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, x: 24, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 24, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed bottom-24 right-6 z-50 flex flex-col bg-white rounded-2xl overflow-hidden"
              style={{
                width: 380,
                maxHeight: 'calc(100vh - 140px)',
                boxShadow: '0 20px 60px -8px rgba(42,75,217,0.14), 0 0 0 1px rgba(42,75,217,0.07)',
              }}
            >
              {/* Header — white with gradient accents */}
              <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b" style={{ borderColor: 'rgba(42,75,217,0.08)' }}>
                <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, #eef2ff, #f3e8ff)' }}>
                  <Icon name="auto_awesome" fill={1} size={16}
                    style={{ color: 'transparent', backgroundImage: 'linear-gradient(135deg, #4f6ef7, #9b51e0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-extrabold font-headline leading-tight"
                    style={{ background: 'linear-gradient(135deg, #4f6ef7, #9b51e0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    Experient Copilot
                  </div>
                  <div className="text-[10px] text-[#9ca3af] font-medium">AI · Survey Intelligence</div>
                </div>
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[10px] text-[#9ca3af] font-bold">LIVE</span>
                  </div>
                  <kbd className="hidden md:block text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#f3f4f6] text-[#9ca3af] border border-[#e5e7eb]">⌘K</kbd>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-[#f3f4f6] text-[#9ca3af] hover:text-[#374151]"
                    aria-label="Close"
                  >
                    <Icon name="close" size={16} />
                  </button>
                </div>
              </div>

              {/* Context strip — shows survey + settings + template */}
              {hasContext && (
                <div className="px-4 py-2.5 border-b flex-shrink-0 bg-[#f8f9ff] border-l-[3px]" style={{ borderBottomColor: 'rgba(42,75,217,0.06)', borderLeftColor: '#2a4bd9' }}>
                  <div className="flex items-center gap-2">
                    <Icon name="edit_note" size={13} style={{ color: '#818cf8', flexShrink: 0 }} />
                    <span className="text-[11px] font-semibold text-[#4338ca] truncate flex-1">
                      {context.surveyTitle || 'Untitled Survey'}
                    </span>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {context.questionCount != null && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#eef2ff] text-[#4338ca]">
                          {context.questionCount}q
                        </span>
                      )}
                      {(context.surveyType || context.templateInfo?.label) && (
                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[#f3e8ff] text-[#7c3aed] max-w-[80px] truncate">
                          {context.surveyType || context.templateInfo?.label}
                        </span>
                      )}
                    </div>
                  </div>
                  {(context.surveySettings?.intent || context.surveySettings?.description) && (
                    <p className="text-[10px] text-[#9ca3af] mt-1 truncate pl-[21px]">
                      {(context.surveySettings.intent || context.surveySettings.description).slice(0, 90)}
                    </p>
                  )}
                </div>
              )}

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-3" style={{ minHeight: 180, maxHeight: 320 }}>
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'ai' && (
                        <div className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg, #eef2ff, #f3e8ff)' }}>
                          <Icon name="auto_awesome" size={11}
                            style={{ backgroundImage: 'linear-gradient(135deg, #4f6ef7, #9b51e0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                        </div>
                      )}
                      <div
                        className="max-w-[84%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                        style={
                          msg.role === 'user'
                            ? { background: '#eff2ff', color: '#312e81', borderBottomRightRadius: 4 }
                            : { background: '#f8f9fc', color: '#374151', borderBottomLeftRadius: 4 }
                        }
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex gap-2 justify-start">
                      <div className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #eef2ff, #f3e8ff)' }}>
                        <Icon name="auto_awesome" size={11}
                          style={{ backgroundImage: 'linear-gradient(135deg, #4f6ef7, #9b51e0)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }} />
                      </div>
                      <div className="px-4 py-3 rounded-2xl" style={{ background: '#f8f9fc', borderBottomLeftRadius: 4 }}>
                        <div className="flex gap-1 items-center">
                          {[0, 1, 2].map((j) => (
                            <div key={j} className="w-1.5 h-1.5 rounded-full animate-bounce"
                              style={{ background: '#a5b4fc', animationDelay: `${j * 0.15}s` }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={bottomRef} />
                </div>
              </ScrollArea>

              {/* Quick commands */}
              {messages.length <= 1 && onRefine && (
                <div className="px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'rgba(42,75,217,0.06)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af] mb-2">Try asking</p>
                  <div className="flex flex-col gap-1.5">
                    {commands.slice(0, 4).map((cmd) => (
                      <button
                        key={cmd}
                        onClick={() => send(cmd)}
                        disabled={loading}
                        className="text-left px-3 py-2 text-xs font-medium rounded-xl text-[#4338ca] transition-colors disabled:opacity-40 truncate"
                        style={{ background: '#f0f5ff' }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = '#e0e7ff'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = '#f0f5ff'; }}
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-2.5 flex-shrink-0">
                <div
                  className="flex items-end gap-2 rounded-xl px-3 py-2.5 transition-all"
                  style={{ background: '#f9fafb', border: '1.5px solid rgba(42,75,217,0.1)' }}
                  onFocusCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(79,110,247,0.3)'; }}
                  onBlurCapture={(e) => { e.currentTarget.style.borderColor = 'rgba(42,75,217,0.1)'; }}
                >
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                    placeholder={onRefine ? 'Describe a change… (↵ to send)' : 'Open a survey to start…'}
                    rows={2}
                    disabled={loading || !onRefine}
                    className="flex-1 resize-none text-sm bg-transparent border-none outline-none text-[#374151] placeholder:text-[#d1d5db] focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || loading || !onRefine}
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-35"
                    style={{
                      background: input.trim() && !loading && onRefine ? '#2a4bd9' : '#e5e7eb',
                      color: input.trim() && !loading && onRefine ? 'white' : '#9ca3af',
                    }}
                    aria-label="Send"
                  >
                    <Icon name="send" size={15} />
                  </button>
                </div>
                <p className="text-[10px] text-[#d1d5db] text-center mt-1.5 font-medium">
                  ↵ send · ⇧↵ newline · ⌘K toggle
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
