import type { Metadata } from 'next'
import { EscalationCard } from '@/components/escalation/EscalationCard'

export const metadata: Metadata = {
  title: 'Escalation Confirmed',
  description:
    'Your support request has been escalated to the Xperiq human intelligence team.',
  robots: { index: false },
}

interface EscalationPageProps {
  searchParams: {
    org?: string
    subject?: string
    ticket?: string
  }
}

export default function EscalationPage({ searchParams }: EscalationPageProps) {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center relative overflow-hidden p-4 md:p-8">
      {/* ── 3D perspective grid background (CSS-only, no Three.js needed) ── */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          backgroundSize: '40px 40px',
          backgroundImage: `
            linear-gradient(to right, rgba(0, 100, 124, 0.07) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(0, 100, 124, 0.07) 1px, transparent 1px)
          `,
          transform: 'perspective(600px) rotateX(55deg) scale(2.5)',
          transformOrigin: '50% 100%',
          opacity: 0.6,
        }}
      />

      {/* Gradient fade at top to blend grid into surface */}
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to bottom, var(--color-surface) 0%, transparent 40%, var(--color-surface) 100%)',
        }}
      />

      {/* Ambient glow blobs */}
      <div
        aria-hidden="true"
        className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(135, 154, 255, 0.12) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />
      <div
        aria-hidden="true"
        className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(circle, rgba(130, 222, 255, 0.10) 0%, transparent 70%)',
          filter: 'blur(40px)',
        }}
      />

      {/* Card */}
      <div className="relative z-10 w-full max-w-2xl">
        <EscalationCard
          orgId={searchParams.org}
          querySubject={searchParams.subject}
          ticketId={searchParams.ticket}
        />
      </div>

      {/* Footer */}
      <footer className="absolute bottom-6 w-full text-center z-10 pointer-events-none">
        <p className="text-on-surface-variant text-sm font-label opacity-60 tracking-wide">
          Xperiq Support Engine · Encrypted Transfer
        </p>
      </footer>
    </div>
  )
}
