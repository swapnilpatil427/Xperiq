'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { createTicket } from '@/lib/api'
import { cn } from '@/lib/cn'

const ISSUE_TYPES = [
  { value: 'technical', label: 'Technical Issue', icon: 'build' },
  { value: 'billing', label: 'Billing Question', icon: 'credit_card' },
  { value: 'feature-request', label: 'Feature Request', icon: 'add_circle' },
  { value: 'account', label: 'Account / Access', icon: 'manage_accounts' },
  { value: 'other', label: 'Other', icon: 'more_horiz' },
]

export function ContactForm() {
  const searchParams = useSearchParams()

  const [type, setType] = useState('technical')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const [ticketId, setTicketId] = useState<string | undefined>()

  // Pre-fill type from URL query param (?type=feature-request)
  useEffect(() => {
    const typeParam = searchParams.get('type')
    if (typeParam && ISSUE_TYPES.some(t => t.value === typeParam)) {
      setType(typeParam)
    }
  }, [searchParams])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!subject.trim() || !body.trim()) {
      setError('Subject and description are required.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const ticket = await createTicket({
        subject: `[${type.toUpperCase()}] ${subject}`,
        body,
        email: email || undefined,
      })
      setTicketId(ticket.id)
      setSuccess(true)
    } catch {
      setError('Failed to submit ticket. Please try again or email support@experient.ai.')
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    const params = new URLSearchParams()
    if (ticketId) params.set('ticket', ticketId)
    if (subject) params.set('subject', subject.slice(0, 100))

    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-secondary-container flex items-center justify-center mb-6 shadow-glow">
          <span
            className="material-symbols-outlined text-on-secondary-container text-4xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
        </div>
        <h2 className="font-headline text-2xl font-bold text-on-surface mb-3">Ticket Submitted</h2>
        <p className="font-body text-on-surface-variant mb-8 max-w-md">
          Your request has been received. Our team will get back to you based on your priority
          level.
        </p>
        <a
          href={`/escalation?${params.toString()}`}
          className="btn-gradient text-on-primary px-8 py-3 rounded-xl font-label font-semibold inline-flex items-center gap-2"
        >
          View Confirmation
          <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Issue type selector */}
      <div>
        <label className="font-label text-sm font-semibold text-on-surface block mb-3">
          Issue Type
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ISSUE_TYPES.map(t => (
            <button
              key={t.value}
              type="button"
              onClick={() => setType(t.value)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-DEFAULT font-label text-sm font-medium transition-all ghost-border',
                type === t.value
                  ? 'bg-primary text-on-primary shadow-glow border-transparent'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-variant hover:text-on-surface'
              )}
            >
              <span className="material-symbols-outlined text-[18px]">{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Email */}
      <div>
        <label
          htmlFor="email"
          className="font-label text-sm font-semibold text-on-surface block mb-2"
        >
          Email Address{' '}
          <span className="text-on-surface-variant font-normal">(optional — if not logged in)</span>
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="you@company.com"
          autoComplete="email"
          className="w-full px-4 py-3 rounded-DEFAULT bg-surface-container-lowest ghost-border font-body text-sm text-on-surface placeholder:text-outline/70 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
        />
      </div>

      {/* Subject */}
      <div>
        <label
          htmlFor="subject"
          className="font-label text-sm font-semibold text-on-surface block mb-2"
        >
          Subject <span className="text-error">*</span>
        </label>
        <input
          id="subject"
          type="text"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          placeholder="Brief description of your issue"
          required
          className="w-full px-4 py-3 rounded-DEFAULT bg-surface-container-lowest ghost-border font-body text-sm text-on-surface placeholder:text-outline/70 focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
        />
      </div>

      {/* Body */}
      <div>
        <label
          htmlFor="body"
          className="font-label text-sm font-semibold text-on-surface block mb-2"
        >
          Description <span className="text-error">*</span>
        </label>
        <textarea
          id="body"
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Describe your issue in detail. Include error messages, steps to reproduce, and your Org ID if applicable."
          required
          rows={6}
          className="w-full px-4 py-3 rounded-DEFAULT bg-surface-container-lowest ghost-border font-body text-sm text-on-surface placeholder:text-outline/70 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
        />
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 text-error text-sm font-body p-3 bg-error-container/10 rounded-DEFAULT ghost-border border-error/20">
          <span className="material-symbols-outlined text-[18px] flex-shrink-0">error</span>
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full btn-gradient text-on-primary py-4 rounded-xl font-label text-base font-semibold flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? (
          <>
            <span className="material-symbols-outlined text-[20px] animate-spin">sync</span>
            Submitting...
          </>
        ) : (
          <>
            <span className="material-symbols-outlined text-[20px]">send</span>
            Submit Support Request
          </>
        )}
      </button>

      <p className="font-body text-xs text-center text-on-surface-variant">
        By submitting, you agree to our{' '}
        <a href="/privacy" className="text-primary hover:underline">
          Privacy Policy
        </a>
        . We&apos;ll only use your email to respond to this ticket.
      </p>
    </form>
  )
}
