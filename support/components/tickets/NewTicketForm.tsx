'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@clerk/nextjs'
import { cn } from '@/lib/cn'

const SEVERITIES = [
  { value: 'low',      label: 'Low',      desc: 'General question' },
  { value: 'medium',   label: 'Medium',   desc: 'Feature not working as expected' },
  { value: 'high',     label: 'High',     desc: 'Significant impact on workflow' },
  { value: 'critical', label: 'Critical', desc: 'Service down / data at risk' },
]

export function NewTicketForm() {
  const router = useRouter()
  const { getToken } = useAuth()
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject.trim() || !body.trim()) return
    setSubmitting(true)
    setError(null)

    try {
      const token = await getToken()
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/support/tickets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), severity }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to submit ticket')
      }

      setSuccess(true)
      setSubject('')
      setBody('')
      setSeverity('medium')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="p-6 rounded-lg bg-surface-container-lowest ghost-border shadow-ambient">
      <h2 className="font-headline text-base font-semibold text-on-surface mb-1">
        Open a new ticket
      </h2>
      <p className="font-body text-xs text-on-surface-variant mb-5">
        We typically respond within 1 business day.
      </p>

      {success ? (
        <div className="text-center py-6">
          <span
            className="material-symbols-outlined text-4xl text-secondary mb-2 block"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          <p className="font-headline text-sm font-semibold text-on-surface mb-1">Ticket submitted</p>
          <p className="font-body text-xs text-on-surface-variant mb-4">
            We&apos;ll follow up at your registered email address.
          </p>
          <button
            onClick={() => setSuccess(false)}
            className="font-label text-xs font-semibold text-primary hover:underline"
          >
            Submit another
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-label text-xs font-semibold text-on-surface mb-1.5">
              Subject
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Briefly describe the issue"
              maxLength={200}
              required
              className="w-full px-3 py-2 rounded-DEFAULT bg-surface-container border border-outline-variant/40 font-body text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
            />
          </div>

          <div>
            <label className="block font-label text-xs font-semibold text-on-surface mb-1.5">
              Severity
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {SEVERITIES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setSeverity(s.value)}
                  className={cn(
                    'p-2 rounded-DEFAULT text-left transition-all font-label text-xs',
                    severity === s.value
                      ? 'bg-primary text-on-primary shadow-glow'
                      : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant/30',
                  )}
                >
                  <span className="font-semibold block">{s.label}</span>
                  <span className={cn('text-[10px]', severity === s.value ? 'text-on-primary/70' : 'text-outline')}>
                    {s.desc}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-label text-xs font-semibold text-on-surface mb-1.5">
              Description
            </label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behavior, screenshots if relevant"
              rows={5}
              maxLength={5000}
              required
              className="w-full px-3 py-2 rounded-DEFAULT bg-surface-container border border-outline-variant/40 font-body text-sm text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
            />
          </div>

          {error && (
            <p className="font-body text-xs text-error bg-error-container/10 px-3 py-2 rounded-DEFAULT">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting || !subject.trim() || !body.trim()}
            className="w-full btn-gradient text-on-primary font-label text-sm font-semibold py-2.5 rounded-xl disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                Submitting…
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">send</span>
                Submit ticket
              </>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
