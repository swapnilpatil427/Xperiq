import { useState, useRef, useEffect } from 'react';
import { Icon } from './Icon';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';

const QUICK_COMMANDS = [
  'Add skip logic: if NPS < 7, skip to last question',
  'Add a multiple choice question about pricing',
  'Make all questions required',
  'Add a matrix question for feature ratings',
  'Change the last question to open text',
  'Add a follow-up "why?" after Q1',
];

export function AiChatPanel({ questionCount, surveyTypeLabel, onRefine, disabled }) {
  const [messages, setMessages] = useState([
    {
      role: 'ai',
      text: `Generated ${questionCount} question${questionCount !== 1 ? 's' : ''}${surveyTypeLabel ? ` for your ${surveyTypeLabel} survey` : ''}. Describe any changes — I can add questions, change types, add skip logic, reorder, or anything else.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: msg }]);
    setLoading(true);
    try {
      const result = await onRefine(msg);
      setMessages((prev) => [...prev, { role: 'ai', text: result.explanation || 'Done! Survey updated.' }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'Something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="flex flex-col rounded-2xl overflow-hidden bg-white h-fit max-h-[600px] min-h-[420px]"
      style={{
        border: '1px solid rgba(171,173,175,0.15)',
        boxShadow: '0 20px 60px rgba(42,75,217,0.08)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center gap-3 px-5 py-4"
        style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}
      >
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <Icon name="psychology" fill={1} size={18} style={{ color: 'white' }} />
        </div>
        <div>
          <div className="text-sm font-extrabold text-white font-headline">AI Survey Agent</div>
          <div className="text-[10px] text-white/70 font-medium">Iterative refinement</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[10px] text-white/80 font-bold">LIVE</span>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="px-4 py-4 h-[360px]">
        <div className="space-y-3">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'ai' && (
                <div className="w-6 h-6 rounded-full flex-shrink-0 mr-2 mt-0.5 flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
                  <Icon name="auto_awesome" size={12} style={{ color: 'white' }} />
                </div>
              )}
              <div
                className="max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed"
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
              <div className="w-6 h-6 rounded-full mr-2 mt-0.5 flex-shrink-0 flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #2a4bd9, #8329c8)' }}>
                <Icon name="auto_awesome" size={12} style={{ color: 'white' }} />
              </div>
              <div className="px-4 py-3 rounded-2xl" style={{ background: '#f0f4ff', borderBottomLeftRadius: 6 }}>
                <div className="flex gap-1 items-center">
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce"
                      style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Quick commands */}
      {messages.length <= 1 && (
        <div className="px-4 pb-3">
          <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant mb-2">Try asking</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_COMMANDS.slice(0, 3).map((cmd) => (
              <Button
                key={cmd}
                onClick={() => send(cmd)}
                disabled={loading || disabled}
                variant="secondary"
                size="sm"
                className="px-3 py-1.5 text-xs font-semibold rounded-full transition-all hover:scale-105 bg-[#e0e7ff] text-[var(--color-primary)]"
              >
                {cmd}
              </Button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="px-4 pb-4">
        <div
          className="flex items-end gap-2 rounded-xl p-3 bg-muted"
          style={{ border: '1px solid rgba(171,173,175,0.2)' }}
        >
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
            }}
            placeholder="Describe a change… (Enter to send)"
            rows={2}
            disabled={loading || disabled}
            className="flex-1 resize-none text-sm bg-transparent border-none outline-none text-on-surface placeholder:text-on-surface-variant/50 focus-visible:ring-0 focus-visible:ring-offset-0 p-0"
          />
          <Button
            onClick={() => send()}
            disabled={!input.trim() || loading || disabled}
            size="icon"
            className="w-8 h-8 rounded-full flex-shrink-0 transition-all hover:scale-110 active:scale-95"
            style={{
              background: input.trim() && !loading ? 'linear-gradient(135deg, #2a4bd9, #8329c8)' : '#dfe3e6',
              color:      input.trim() && !loading ? 'white' : 'var(--color-inverse-on-surface)',
            }}
          >
            <Icon name="send" size={16} />
          </Button>
        </div>
      </div>
    </div>
  );
}
