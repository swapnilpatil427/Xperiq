'use client'
import { useState } from 'react'
import { submitFeedback } from '@/lib/api'
import { cn } from '@/lib/cn'

interface ArticleFeedbackProps {
  docKey: string
}

export function ArticleFeedback({ docKey }: ArticleFeedbackProps) {
  const [selected, setSelected] = useState<'helpful' | 'not_helpful' | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [comment, setComment] = useState('')

  const handleFeedback = async (type: 'helpful' | 'not_helpful') => {
    setSelected(type)
    if (type === 'helpful') {
      try {
        await submitFeedback({ doc_key: docKey, type, comment: '' })
        setSubmitted(true)
      } catch {}
    }
  }

  const handleSubmitComment = async () => {
    if (!selected) return
    try {
      await submitFeedback({ doc_key: docKey, type: selected, comment })
      setSubmitted(true)
    } catch {}
  }

  if (submitted) {
    return (
      <div className="mt-12 pt-8 border-t border-outline-variant/15 flex items-center gap-3 text-secondary">
        <span
          className="material-symbols-outlined"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          check_circle
        </span>
        <p className="font-body text-sm">
          Thank you for your feedback! It helps us improve our documentation.
        </p>
      </div>
    )
  }

  return (
    <div className="mt-12 pt-8 border-t border-outline-variant/15">
      <p className="font-label text-sm font-medium text-on-surface mb-4">
        Was this article helpful?
      </p>
      <div className="flex items-center gap-3">
        <button
          onClick={() => handleFeedback('helpful')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full font-label text-sm font-medium transition-all ghost-border',
            selected === 'helpful'
              ? 'bg-secondary-container text-on-secondary-container'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
          )}
        >
          <span className="material-symbols-outlined text-[18px]">thumb_up</span>
          Yes, helpful
        </button>
        <button
          onClick={() => handleFeedback('not_helpful')}
          className={cn(
            'flex items-center gap-2 px-4 py-2 rounded-full font-label text-sm font-medium transition-all ghost-border',
            selected === 'not_helpful'
              ? 'bg-error-container/10 text-error'
              : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
          )}
        >
          <span className="material-symbols-outlined text-[18px]">thumb_down</span>
          Needs improvement
        </button>
      </div>

      {selected === 'not_helpful' && !submitted && (
        <div className="mt-4 space-y-3">
          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="What could we improve? (optional)"
            className="w-full max-w-lg h-24 p-4 rounded-DEFAULT bg-surface-container-lowest ghost-border font-body text-sm text-on-surface placeholder:text-outline/70 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button
            onClick={handleSubmitComment}
            className="btn-gradient text-on-primary px-6 py-2 rounded-xl font-label text-sm font-semibold"
          >
            Submit Feedback
          </button>
        </div>
      )}
    </div>
  )
}
