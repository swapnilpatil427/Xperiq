'use client'
import { useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { CrystalSession } from './CrystalSession'

interface CrystalPanelProps {
  docKey: string
  docTitle: string
}

const QUICK_QUESTIONS = [
  'Give me a quick summary',
  'What are common issues?',
  'Show me code examples',
  'How does this connect to workflows?',
]

export function CrystalPanel({ docKey, docTitle }: CrystalPanelProps) {
  const [sessionOpen, setSessionOpen] = useState(false)
  const [initialQuery, setInitialQuery] = useState('')

  const openSession = (query: string) => {
    setInitialQuery(query)
    setSessionOpen(true)
  }

  return (
    <>
      <div className="bg-surface-container-lowest rounded-lg ghost-border shadow-ambient overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/10 bg-gradient-to-r from-primary/5 to-tertiary/5">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-tertiary-container to-primary-container flex items-center justify-center">
              <span
                className="material-symbols-outlined text-on-primary-container text-sm"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                psychology
              </span>
            </div>
            <div>
              <p className="font-label text-sm font-semibold text-on-surface">Ask Crystal</p>
              <p className="font-label text-xs text-on-surface-variant">AI-powered answers</p>
            </div>
          </div>
        </div>

        {/* Quick questions */}
        <div className="p-4 space-y-2">
          {QUICK_QUESTIONS.map(q => (
            <button
              key={q}
              onClick={() => openSession(q)}
              className="w-full text-left px-3 py-2.5 rounded-DEFAULT text-sm font-body text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors flex items-center gap-2 group"
            >
              <span className="material-symbols-outlined text-[16px] text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                arrow_right
              </span>
              {q}
            </button>
          ))}
        </div>

        {/* Custom question */}
        <div className="px-4 pb-4">
          <div className="tonal-separator mb-3" />
          <button
            onClick={() => openSession('')}
            className="w-full btn-gradient text-on-primary py-2.5 rounded-xl font-label text-sm font-semibold flex items-center justify-center gap-2"
          >
            <span
              className="material-symbols-outlined text-[18px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              magic_button
            </span>
            Ask a custom question
          </button>
        </div>
      </div>

      {/* Full session modal */}
      <AnimatePresence>
        {sessionOpen && (
          <CrystalSession
            docKey={docKey}
            docTitle={docTitle}
            initialQuery={initialQuery}
            onClose={() => setSessionOpen(false)}
          />
        )}
      </AnimatePresence>
    </>
  )
}
