'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

interface Message {
  role: 'user' | 'crystal'
  content: string
  reasoning?: string[]
  sources?: { title: string; key: string }[]
  timestamp: Date
  streaming?: boolean
}

interface CrystalSessionProps {
  docKey: string
  docTitle: string
  initialQuery: string
  onClose: () => void
}

// Generate a stable ticket ID per session mount
function generateTicketId() {
  return `XT-${Math.floor(Math.random() * 9000 + 1000)}`
}

const SUGGESTED_RESOURCES = [
  { title: 'Getting Started Guide', key: 'getting-started' },
  { title: 'API Authentication', key: 'api-authentication' },
  { title: 'Workflow Automation', key: 'workflow-automation' },
]

export function CrystalSession({
  docKey,
  docTitle,
  initialQuery,
  onClose,
}: CrystalSessionProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState(initialQuery)
  const [loading, setLoading] = useState(false)
  const [ticketId] = useState(generateTicketId)
  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = useCallback(
    async (text: string) => {
      if (!text.trim() || loading) return

      const userMessage: Message = {
        role: 'user',
        content: text.trim(),
        timestamp: new Date(),
      }

      setMessages(prev => [...prev, userMessage])
      setInput('')
      setLoading(true)

      // Placeholder crystal message while streaming
      const crystalPlaceholder: Message = {
        role: 'crystal',
        content: '',
        reasoning: [],
        sources: [],
        timestamp: new Date(),
        streaming: true,
      }

      setMessages(prev => [...prev, crystalPlaceholder])

      try {
        const res = await fetch('/api/crystal-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: text.trim(),
            context_doc: docKey,
          }),
        })

        if (!res.body) throw new Error('No stream')

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let fullAnswer = ''
        let reasoning: string[] = []
        let sources: { title: string; key: string }[] = []

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const chunk = decoder.decode(value)
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ')) continue
            try {
              const parsed = JSON.parse(line.slice(6))
              if (parsed.type === 'reasoning' && parsed.content) {
                reasoning = [...reasoning, parsed.content]
              } else if (parsed.type === 'answer' && parsed.content) {
                fullAnswer += parsed.content
              } else if (parsed.type === 'sources' && parsed.sources) {
                sources = parsed.sources
              }

              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = {
                  ...updated[updated.length - 1],
                  content: fullAnswer,
                  reasoning,
                  sources,
                }
                return updated
              })
            } catch {
              // Malformed SSE chunk — skip
            }
          }
        }
      } catch {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = {
            ...updated[updated.length - 1],
            content:
              "I'm having trouble processing that right now. Please try rephrasing or contact our support team.",
            streaming: false,
          }
          return updated
        })
      } finally {
        setMessages(prev => {
          const updated = [...prev]
          updated[updated.length - 1] = { ...updated[updated.length - 1], streaming: false }
          return updated
        })
        setLoading(false)
      }
    },
    [loading, docKey]
  )

  // Fire initial query once on mount
  useEffect(() => {
    if (initialQuery) {
      sendMessage(initialQuery)
    } else {
      inputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-surface flex flex-col"
    >
      {/* Top bar */}
      <nav className="glass-panel border-b border-outline-variant/15 h-16 flex items-center justify-between px-8 flex-shrink-0">
        <div>
          <h1 className="font-headline text-lg font-bold text-on-surface flex items-center gap-2">
            <span
              className="material-symbols-outlined text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              support_agent
            </span>
            Support Session
          </h1>
          <p className="font-label text-xs text-on-surface-variant">
            Ticket #{ticketId} &middot; Active
          </p>
        </div>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-4 py-2 bg-surface-container-low hover:bg-surface-container text-on-surface text-sm font-label font-medium rounded-DEFAULT transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">close</span>
          End Session
        </button>
      </nav>

      {/* Main layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Chat canvas */}
        <section className="flex-1 flex flex-col overflow-hidden relative">
          <div className="flex-1 overflow-y-auto p-8 space-y-8 pb-32">
            {messages.length === 0 && (
              <div className="max-w-2xl mx-auto text-center py-20">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-tertiary-container to-primary-container flex items-center justify-center mx-auto mb-6 shadow-glow">
                  <span
                    className="material-symbols-outlined text-on-primary-container text-2xl"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    psychology
                  </span>
                </div>
                <h2 className="font-headline text-2xl font-bold text-on-surface mb-3">
                  Ask Crystal anything
                </h2>
                <p className="font-body text-on-surface-variant">
                  I can help you with {docTitle}, workflows, data analysis, and any Experient
                  feature.
                </p>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className="w-full max-w-4xl mx-auto">
                {msg.role === 'user' ? (
                  <div className="flex flex-col items-end">
                    <div className="bg-surface-container-low rounded-lg rounded-tr-sm px-6 py-4 max-w-[80%] shadow-ambient ghost-border">
                      <p className="font-body text-base text-on-surface">{msg.content}</p>
                    </div>
                    <span className="font-label text-xs text-on-surface-variant mt-2 mr-2">
                      {msg.timestamp.toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-tertiary-container to-primary-container flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span
                        className="material-symbols-outlined text-on-primary-container text-lg"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        psychology
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      {/* Reasoning trace */}
                      {msg.reasoning && msg.reasoning.length > 0 && (
                        <div className="bg-surface-container-low rounded-lg p-4 ghost-border mb-4 relative overflow-hidden">
                          <div className="flex items-center gap-2 mb-3">
                            <span
                              className={cn(
                                'material-symbols-outlined text-primary text-sm',
                                msg.streaming && 'animate-spin'
                              )}
                            >
                              sync
                            </span>
                            <span className="font-label text-sm font-medium text-primary">
                              Crystal is analyzing...
                            </span>
                          </div>
                          <div className="space-y-2 pl-6">
                            {msg.reasoning.map((step, j) => (
                              <div
                                key={j}
                                className="flex items-center gap-2 text-on-surface-variant"
                              >
                                <span className="material-symbols-outlined text-[16px] text-tertiary">
                                  check_circle
                                </span>
                                <span className="font-body text-sm">{step}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Answer */}
                      {msg.content && (
                        <div className="bg-surface-container-lowest rounded-lg p-6 shadow-ambient ghost-border relative">
                          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-tertiary to-primary rounded-t-lg opacity-80" />
                          <p className="font-body text-base text-on-surface leading-relaxed whitespace-pre-wrap">
                            {msg.content}
                          </p>

                          {msg.sources && msg.sources.length > 0 && (
                            <div className="mt-5 pt-4 border-t border-outline-variant/15">
                              <p className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
                                Sources
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {msg.sources.map(s => (
                                  <a
                                    key={s.key}
                                    href={`/guides/${s.key}`}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high rounded-full font-label text-xs text-secondary transition-colors ghost-border"
                                  >
                                    <span className="material-symbols-outlined text-[14px]">
                                      article
                                    </span>
                                    {s.title}
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Streaming indicator when no content yet */}
                      {msg.streaming && !msg.content && (
                        <div className="flex items-center gap-2 text-on-surface-variant p-4">
                          <span className="font-body text-sm animate-pulse">
                            Crystal is thinking...
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input bar — sticky to bottom of chat section */}
          <div className="sticky bottom-0 p-6 glass-panel border-t border-outline-variant/10">
            <div className="max-w-4xl mx-auto flex gap-3">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage(input)
                  }
                }}
                placeholder="Ask a follow-up question..."
                disabled={loading}
                className="flex-1 bg-surface-container-lowest ghost-border rounded-full py-4 pl-6 pr-4 font-body text-base text-on-surface placeholder:text-outline/70 focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
              />
              <button
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                className="btn-gradient text-on-primary w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 disabled:opacity-50 transition-opacity"
                aria-label="Send message"
              >
                <span className="material-symbols-outlined">send</span>
              </button>
            </div>
          </div>
        </section>

        {/* Right sidebar */}
        <aside className="hidden lg:flex w-80 bg-surface-container-low border-l border-outline-variant/15 flex-col">
          <div className="p-6 border-b border-outline-variant/15">
            <h2 className="font-headline text-base font-semibold text-on-surface flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">library_books</span>
              Suggested Resources
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto p-6 space-y-3">
            {SUGGESTED_RESOURCES.map(r => (
              <a
                key={r.key}
                href={`/guides/${r.key}`}
                className="block bg-surface-container-lowest p-4 rounded-DEFAULT shadow-ambient hover:shadow-glow transition-shadow ghost-border group"
              >
                <h3 className="font-label text-sm font-medium text-on-surface group-hover:text-primary transition-colors mb-1">
                  {r.title}
                </h3>
                <p className="font-body text-xs text-on-surface-variant">
                  Browse documentation &rarr;
                </p>
              </a>
            ))}
          </div>
          <div className="p-6 border-t border-outline-variant/15 bg-surface-container">
            <p className="font-label text-xs text-on-surface-variant mb-3 text-center">
              Need more help?
            </p>
            <a
              href="/contact"
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-transparent hover:bg-surface-container-high ghost-border rounded-DEFAULT font-label text-sm font-medium text-on-surface transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">support</span>
              Talk to a Human
            </a>
          </div>
        </aside>
      </div>
    </motion.div>
  )
}
