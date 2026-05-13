import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Icon } from './Icon';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

const QUICK_COMMANDS = [
  'Add skip logic: if NPS < 7, skip to last question',
  'Add a multiple choice question about pricing',
  'Make all questions required',
  'Add a follow-up "why?" after Q1',
];

function buildGreeting({ surveyType, questionCount }) {
  if (questionCount) {
    return `I see you're building ${surveyType ? `a ${surveyType} survey` : 'a survey'} with ${questionCount} question${questionCount !== 1 ? 's' : ''}. Tell me what to change — I can add, reorder, tweak logic, or anything else.`;
  }
  return `Hi, I'm Iris — your Experient AI. I can help you build and refine surveys. What would you like to create?`;
}

export function IrisChat({ context = {}, onRefine }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    { role: 'ai', text: buildGreeting(context) },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 120);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading || !onRefine) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const result = await onRefine(msg);
      const reply = { role: 'ai', text: result.explanation || 'Done! Survey updated.' };
      setMessages((prev) => [...prev, reply]);
      if (!isOpen) setUnread((u) => u + 1);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
      if (isOpen) inputRef.current?.focus();
    }
  };

  return (
    <>
      {/* Floating bubble */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        <AnimatePresence>
          {!isOpen && messages.length <= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 4, scale: 0.95 }}
              transition={{ delay: 1.2, duration: 0.2 }}
              onClick={() => setIsOpen(true)}
              className="cursor-pointer bg-white rounded-2xl px-4 py-2.5 text-sm font-semibold text-on-surface"
              style={{
                boxShadow: '0 8px 24px rgba(42,75,217,0.15)',
                border: '1.5px solid rgba(42,75,217,0.12)',
              }}
            >
              <span className="font-black text-primary mr-1">Iris</span>
              can help refine ✨
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsOpen((o) => !o)}
          className="relative w-14 h-14 rounded-full flex items-center justify-center transition-transform hover:scale-110 active:scale-95"
          style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)', boxShadow: '0 8px 28px rgba(42,75,217,0.4)' }}
          aria-label="Open Iris AI chat"
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

      {/* Chat drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: 'rgba(0,0,0,0.2)' }}
              onClick={() => setIsOpen(false)}
            />

            <motion.div
              initial={{ opacity: 0, x: 20, scale: 0.97 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 20, scale: 0.97 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="fixed bottom-24 right-6 z-50 w-[360px] rounded-2xl overflow-hidden flex flex-col bg-white"
              style={{
                boxShadow: '0 32px 80px -8px rgba(42,75,217,0.22), 0 0 0 1px rgba(42,75,217,0.09)',
                maxHeight: 'calc(100vh - 130px)',
              }}
            >
              {/* Header */}
              <div
                className="flex items-center gap-3 px-4 py-3.5 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
              >
                <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                  <Icon name="auto_awesome" fill={1} size={16} style={{ color: 'white' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-extrabold text-white font-headline">Iris</div>
                  <div className="text-[10px] text-white/70 font-medium">Experient AI · Survey Intelligence</div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                    <span className="text-[10px] text-white/80 font-bold">LIVE</span>
                  </div>
                  <button
                    onClick={() => setIsOpen(false)}
                    className="w-7 h-7 rounded-full flex items-center justify-center transition-colors hover:bg-white/20"
                    aria-label="Close Iris"
                  >
                    <Icon name="close" size={16} style={{ color: 'white' }} />
                  </button>
                </div>
              </div>

              {/* Context pill */}
              {context.surveyTitle && (
                <div className="px-4 py-2 border-b flex-shrink-0" style={{ borderColor: 'rgba(42,75,217,0.08)' }}>
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-primary">
                    <Icon name="edit_note" size={14} />
                    <span className="truncate">{context.surveyTitle}</span>
                    {context.questionCount != null && (
                      <span className="ml-auto flex-shrink-0 text-on-surface-variant">{context.questionCount}q</span>
                    )}
                  </div>
                </div>
              )}

              {/* Messages */}
              <ScrollArea className="flex-1 px-4 py-4" style={{ minHeight: 200, maxHeight: 340 }}>
                <div className="space-y-3">
                  {messages.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'ai' && (
                        <div
                          className="w-6 h-6 rounded-full flex-shrink-0 mr-2 mt-0.5 flex items-center justify-center"
                          style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
                        >
                          <Icon name="auto_awesome" size={11} style={{ color: 'white' }} />
                        </div>
                      )}
                      <div
                        className="max-w-[82%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
                        style={
                          msg.role === 'user'
                            ? { background: '#2a4bd9', color: 'white', borderBottomRightRadius: 6 }
                            : { background: '#f0f4ff', color: '#2c2f31', borderBottomLeftRadius: 6 }
                        }
                      >
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  {loading && (
                    <div className="flex justify-start">
                      <div
                        className="w-6 h-6 rounded-full mr-2 mt-0.5 flex-shrink-0 flex items-center justify-center"
                        style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}
                      >
                        <Icon name="auto_awesome" size={11} style={{ color: 'white' }} />
                      </div>
                      <div className="px-4 py-3 rounded-2xl" style={{ background: '#f0f4ff', borderBottomLeftRadius: 6 }}>
                        <div className="flex gap-1 items-center">
                          {[0, 1, 2].map((i) => (
                            <div
                              key={i}
                              className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }}
                            />
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
                <div className="px-4 py-3 border-t flex-shrink-0" style={{ borderColor: 'rgba(171,173,175,0.12)' }}>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Try asking</p>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_COMMANDS.slice(0, 3).map((cmd) => (
                      <button
                        key={cmd}
                        onClick={() => send(cmd)}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-semibold rounded-full bg-[#e0e7ff] text-primary hover:bg-primary hover:text-white transition-colors disabled:opacity-40"
                      >
                        {cmd}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <div className="px-4 pb-4 pt-2 flex-shrink-0">
                <div
                  className="flex items-end gap-2 rounded-xl p-3"
                  style={{ background: 'rgba(42,75,217,0.04)', border: '1.5px solid rgba(42,75,217,0.1)' }}
                >
                  <Textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
                    }}
                    placeholder={onRefine ? 'Describe a change… (Enter to send)' : 'Select a survey step to start refining…'}
                    rows={2}
                    disabled={loading || !onRefine}
                    className="flex-1 resize-none text-sm bg-transparent border-none outline-none text-on-surface placeholder:text-on-surface-variant/50 focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
                  />
                  <button
                    onClick={() => send()}
                    disabled={!input.trim() || loading || !onRefine}
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center transition-all hover:scale-110 active:scale-95 disabled:opacity-40"
                    style={{
                      background: input.trim() && !loading && onRefine ? 'linear-gradient(135deg, #2a4bd9, #8329c8)' : '#dfe3e6',
                      color: input.trim() && !loading && onRefine ? 'white' : 'var(--color-inverse-on-surface)',
                    }}
                    aria-label="Send"
                  >
                    <Icon name="send" size={15} />
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
