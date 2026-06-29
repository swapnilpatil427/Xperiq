import type { Metadata } from 'next'
import { Suspense } from 'react'
import { PageShell } from '@/components/layout/PageShell'
import { ContactForm } from '@/components/contact/ContactForm'

export const metadata: Metadata = {
  title: 'Contact Support',
  description:
    "Get help from the Xperiq enterprise support team. Open a ticket, describe your issue, and we'll respond within 2 hours.",
  alternates: { canonical: '/contact' },
}

const SLA_TIERS = [
  {
    icon: 'bolt',
    title: 'P1 Critical',
    time: '< 1 hour',
    desc: 'Production outage or data loss',
    color: 'text-error',
    bg: 'bg-error-container/10',
  },
  {
    icon: 'timer',
    title: 'P2 High',
    time: '< 4 hours',
    desc: 'Major feature broken',
    color: 'text-primary',
    bg: 'bg-primary-container/20',
  },
  {
    icon: 'schedule',
    title: 'P3 Normal',
    time: '< 2 days',
    desc: 'General questions and requests',
    color: 'text-secondary',
    bg: 'bg-secondary-container/20',
  },
]

export default function ContactPage() {
  return (
    <PageShell>
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-[1fr_2fr] gap-16">
          {/* ── Left: info panel ── */}
          <div>
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container ghost-border text-sm font-label text-on-surface-variant mb-6">
              <span
                className="material-symbols-outlined text-[16px] text-secondary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                support_agent
              </span>
              Enterprise Support
            </div>

            <h1 className="font-display text-4xl font-extrabold text-on-background tracking-tight mb-4">
              Talk to our team
            </h1>

            <p className="font-body text-on-surface-variant leading-relaxed mb-8">
              Our enterprise support team typically responds within 2 hours during business hours.
              For urgent issues, include your severity level in the subject.
            </p>

            {/* SLA cards */}
            <div className="space-y-4 mb-10">
              {SLA_TIERS.map(sla => (
                <div
                  key={sla.title}
                  className={`flex items-center gap-4 p-4 rounded-DEFAULT ${sla.bg} ghost-border`}
                >
                  <span
                    className={`material-symbols-outlined ${sla.color} flex-shrink-0`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {sla.icon}
                  </span>
                  <div>
                    <p className="font-label text-sm font-semibold text-on-surface">
                      {sla.title}:{' '}
                      <span className={sla.color}>{sla.time}</span>
                    </p>
                    <p className="font-body text-xs text-on-surface-variant">{sla.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Direct email */}
            <div className="p-4 rounded-DEFAULT bg-surface-container ghost-border">
              <p className="font-label text-xs text-on-surface-variant uppercase tracking-wide mb-2">
                Direct Email
              </p>
              <a
                href="mailto:support@xperiq.ai"
                className="font-label text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">mail</span>
                support@xperiq.ai
              </a>
            </div>
          </div>

          {/* ── Right: form ── */}
          <div className="bg-surface-container-lowest rounded-lg p-8 ghost-border shadow-ambient">
            <h2 className="font-headline text-xl font-bold text-on-surface mb-6">
              Open a Support Ticket
            </h2>
            {/*
              ContactForm uses useSearchParams — wrap in Suspense so the page
              can statically render while the form hydrates with URL params.
            */}
            <Suspense fallback={<div className="h-96 animate-pulse bg-surface-container rounded-DEFAULT" />}>
              <ContactForm />
            </Suspense>
          </div>
        </div>
      </div>
    </PageShell>
  )
}
