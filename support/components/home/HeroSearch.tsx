'use client'
import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/cn'

const SUGGESTIONS = [
  'Troubleshoot API key issues',
  'How to export respondent data',
  'Set up NPS automation workflow',
  'Configure sentiment analysis',
  'Integrate with Salesforce',
  'Why did my NPS drop this week?',
  'Create a custom survey template',
  'Understanding Crystal AI insights',
]

interface StreamChunk {
  type: 'reasoning' | 'answer' | 'sources' | 'done' | 'error'
  content?: string
  sources?: { title: string; key: string }[]
}

export function HeroSearch() {
  const router = useRouter()
  const [query, setQuery] = useState('')
  const [focused, setFocused] = useState(false)
  const [loading, setLoading] = useState(false)
  const [answer, setAnswer] = useState('')
  const [reasoning, setReasoning] = useState<string[]>([])
  const [sources, setSources] = useState<{ title: string; key: string }[]>([])
  const [showAnswer, setShowAnswer] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim()) return

      const trimmed = searchQuery.trim()
      if (trimmed.length < 4) {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`)
        return
      }

      setLoading(true)
      setAnswer('')
      setReasoning([])
      setSources([])
      setShowAnswer(true)

      try {
        const res = await fetch('/api/crystal-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: trimmed }),
        })

        if (!res.ok || !res.body) {
          router.push(`/search?q=${encodeURIComponent(trimmed)}`)
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()

        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          const text = decoder.decode(value)
          const lines = text.split('\n')

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            try {
              const chunk: StreamChunk = JSON.parse(line.slice(6))
              if (chunk.type === 'reasoning' && chunk.content) {
                setReasoning((prev) => [...prev, chunk.content!])
              } else if (chunk.type === 'answer' && chunk.content) {
                setAnswer((prev) => prev + chunk.content)
              } else if (chunk.type === 'sources' && chunk.sources) {
                setSources(chunk.sources)
              }
            } catch {
              // Ignore malformed SSE lines
            }
          }
        }
      } catch {
        router.push(`/search?q=${encodeURIComponent(trimmed)}`)
      } finally {
        setLoading(false)
      }
    },
    [router],
  )

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && query.trim()) {
      handleSearch(query)
    }
    if (e.key === 'Escape') {
      setShowAnswer(false)
      setQuery('')
    }
  }

  return (
    <div className="w-full max-w-3xl mx-auto px-4">
      {/* Search Input */}
      <div className="relative group">
        {/* Glow halo */}
        <div
          className={cn(
            'absolute inset-0 bg-gradient-to-r from-primary-container/20 to-tertiary-container/20 rounded-full blur-xl transition-opacity duration-500',
            focused ? 'opacity-100' : 'opacity-0',
          )}
        />

        {/* Input container */}
        <div
          className={cn(
            'relative flex items-center bg-surface-container-lowest rounded-full h-20 px-8 ghost-border transition-all duration-300',
            focused ? 'shadow-glow scale-[1.01]' : 'shadow-ambient',
          )}
        >
          <span
            className="material-symbols-outlined text-primary text-3xl mr-4 flex-shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            magic_button
          </span>

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={handleKeyDown}
            placeholder="How can we help?"
            className="flex-1 bg-transparent border-none outline-none text-xl font-body text-on-background placeholder:text-outline/70"
            aria-label="Ask Crystal a question"
          />

          <button
            onClick={() => handleSearch(query)}
            disabled={loading || !query.trim()}
            className={cn(
              'ml-2 w-12 h-12 rounded-full btn-gradient text-on-primary flex items-center justify-center shadow-sm transition-transform',
              'hover:scale-105 active:scale-95',
              'disabled:opacity-50 disabled:pointer-events-none',
            )}
          >
            <span className="material-symbols-outlined">
              {loading ? 'sync' : 'arrow_forward'}
            </span>
          </button>
        </div>
      </div>

      {/* Suggestion chips */}
      <div className="mt-5 flex flex-wrap justify-center gap-2">
        {SUGGESTIONS.slice(0, 4).map((s) => (
          <button
            key={s}
            onClick={() => {
              setQuery(s)
              handleSearch(s)
            }}
            className="px-4 py-1.5 rounded-full bg-surface-container text-sm font-label font-medium text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all duration-200 ghost-border"
          >
            &ldquo;{s}&rdquo;
          </button>
        ))}
      </div>

      {/* Crystal Answer Panel */}
      <AnimatePresence>
        {showAnswer && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="mt-6 bg-surface-container-lowest rounded-lg shadow-ambient ghost-border overflow-hidden"
          >
            {/* Top gradient bar */}
            <div className="h-1 w-full bg-gradient-to-r from-tertiary to-primary" />

            {/* Reasoning trace */}
            {reasoning.length > 0 && (
              <div className="px-6 pt-5 pb-3 bg-surface-container-low rounded-none">
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className={cn(
                      'material-symbols-outlined text-primary text-sm',
                      loading && 'animate-spin',
                    )}
                  >
                    sync
                  </span>
                  <span className="font-label text-sm font-medium text-primary">
                    Crystal is analyzing...
                  </span>
                </div>
                <div className="space-y-2 pl-6">
                  {reasoning.map((step, i) => (
                    <div key={i} className="flex items-center gap-2 text-on-surface-variant">
                      <span className="material-symbols-outlined text-[16px] text-tertiary">
                        check_circle
                      </span>
                      <span className="font-body text-sm">{step}</span>
                    </div>
                  ))}
                  {loading && reasoning.length > 0 && (
                    <div className="flex items-center gap-2 text-on-surface">
                      <span className="material-symbols-outlined text-[16px] text-secondary animate-pulse">
                        radio_button_unchecked
                      </span>
                      <span className="font-body text-sm font-medium">
                        Synthesizing answer...
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Answer */}
            {answer && (
              <div className="px-6 py-5">
                <h3 className="font-headline text-base font-semibold text-on-surface mb-3">
                  Crystal&apos;s Answer
                </h3>
                <p className="font-body text-base text-on-surface leading-relaxed whitespace-pre-wrap">
                  {answer}
                </p>
              </div>
            )}

            {/* Sources */}
            {sources.length > 0 && (
              <div className="px-6 pb-5 pt-2 border-t border-outline-variant/10">
                <p className="font-label text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-3">
                  Related Articles
                </p>
                <div className="flex flex-wrap gap-2">
                  {sources.map((s) => (
                    <a
                      key={s.key}
                      href={`/guides/${s.key}`}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-container hover:bg-surface-container-high rounded-full font-label text-xs text-secondary transition-colors ghost-border"
                    >
                      <span className="material-symbols-outlined text-[14px]">article</span>
                      {s.title}
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Full session CTA */}
            <div className="px-6 py-4 border-t border-outline-variant/10 flex items-center justify-between">
              <p className="font-label text-xs text-on-surface-variant">
                AI-powered · may be incorrect · always verify critical decisions
              </p>
              <a
                href={`/search?q=${encodeURIComponent(query)}&mode=crystal`}
                className="text-sm font-semibold text-primary flex items-center gap-1 hover:text-primary-dim transition-colors"
              >
                Full session{' '}
                <span className="material-symbols-outlined text-[16px]">arrow_right_alt</span>
              </a>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
