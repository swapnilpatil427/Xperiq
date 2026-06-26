'use client'

import { useEffect } from 'react'
import { PageShell } from '@/components/layout/PageShell'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-error-container/20 ghost-border mb-8">
          <span
            className="material-symbols-outlined text-4xl text-error"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            error
          </span>
        </div>
        <h1 className="font-display text-4xl font-extrabold text-on-background tracking-tight mb-4">
          Something went wrong
        </h1>
        <p className="font-body text-on-surface-variant mb-10">
          An unexpected error occurred. Our team has been notified.
          {error.digest && (
            <span className="block mt-2 font-mono text-xs text-outline">
              Error ID: {error.digest}
            </span>
          )}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            onClick={reset}
            className="inline-flex items-center gap-2 btn-gradient text-on-primary px-6 py-3 rounded-xl font-label font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">refresh</span>
            Try again
          </button>
          <a
            href="/contact"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-label font-semibold ghost-border bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">support_agent</span>
            Contact support
          </a>
        </div>
      </div>
    </PageShell>
  )
}
