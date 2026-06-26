import Link from 'next/link'

interface EscalationCardProps {
  orgId?: string
  querySubject?: string
  ticketId?: string
}

export function EscalationCard({ orgId, querySubject, ticketId }: EscalationCardProps) {
  const hasContext = orgId || querySubject || ticketId

  return (
    <div
      className="bg-surface-container-lowest rounded-lg p-8 md:p-12 ghost-border relative overflow-hidden backdrop-blur-2xl"
      style={{ boxShadow: '0 40px 60px -10px rgba(44, 47, 49, 0.06), 0 0 0 1px rgba(171, 173, 175, 0.2)' }}
    >
      {/* Decorative top-right glow */}
      <div className="absolute top-0 right-0 -mt-16 -mr-16 w-48 h-48 bg-secondary-container rounded-full blur-3xl opacity-25 pointer-events-none" />
      {/* Decorative bottom-left glow */}
      <div className="absolute bottom-0 left-0 -mb-12 -ml-12 w-40 h-40 bg-primary-container rounded-full blur-3xl opacity-15 pointer-events-none" />

      {/* Header */}
      <div className="text-center mb-10">
        {/* Agent icon */}
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-secondary-container text-on-secondary-container mb-6 shadow-glow ring-4 ring-secondary-container/20">
          <span
            className="material-symbols-outlined text-4xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            support_agent
          </span>
        </div>

        <h1 className="font-headline text-3xl md:text-5xl font-extrabold tracking-tight text-on-surface mb-4">
          Escalation Confirmed
        </h1>
        <p className="text-on-surface-variant text-lg font-body max-w-md mx-auto">
          Your query has been securely transferred to our human intelligence team.
        </p>
      </div>

      {/* Details */}
      <div className="space-y-5 mb-10">
        {/* SLA card */}
        <div className="bg-surface-container-low rounded-DEFAULT p-6 flex items-start gap-4 ghost-border">
          <span className="material-symbols-outlined text-tertiary text-2xl mt-0.5 flex-shrink-0">
            timer
          </span>
          <div>
            <h3 className="font-headline font-semibold text-lg text-on-surface mb-1">
              Estimated Response
            </h3>
            <p className="text-tertiary-dim font-label font-bold text-2xl tracking-tight">
              Under 2 hours
            </p>
            <p className="text-on-surface-variant text-sm mt-2 font-body">
              Priority routing based on your org configuration and tier.
            </p>
          </div>
        </div>

        {/* Session context panel — only shown when data is present */}
        {hasContext && (
          <div className="bg-surface-variant rounded-DEFAULT p-6 ghost-border">
            {/* Panel header */}
            <div className="flex items-center justify-between mb-5 pb-4 border-b border-outline-variant/25">
              <span className="text-xs font-label font-semibold text-on-surface-variant uppercase tracking-wider">
                Session Context Attached
              </span>
              <span
                className="material-symbols-outlined text-secondary text-xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                verified
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {orgId && (
                <div>
                  <p className="text-xs text-on-surface-variant uppercase tracking-wide mb-1.5 font-label">
                    Organization ID
                  </p>
                  <p className="font-mono text-sm text-on-surface bg-surface-container-high px-2.5 py-1.5 rounded inline-block">
                    {orgId}
                  </p>
                </div>
              )}
              {ticketId && (
                <div>
                  <p className="text-xs text-on-surface-variant uppercase tracking-wide mb-1.5 font-label">
                    Ticket ID
                  </p>
                  <p className="font-mono text-sm text-on-surface bg-surface-container-high px-2.5 py-1.5 rounded inline-block">
                    #{ticketId}
                  </p>
                </div>
              )}
              {querySubject && (
                <div className="md:col-span-2">
                  <p className="text-xs text-on-surface-variant uppercase tracking-wide mb-2 font-label">
                    Query Subject
                  </p>
                  {/* Left-border accent per design spec */}
                  <div className="bg-surface-container-lowest p-4 rounded text-sm text-on-surface-variant font-body leading-relaxed relative overflow-hidden">
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-tertiary rounded-l" />
                    <p className="pl-4">{querySubject}</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* What happens next */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { step: '1', icon: 'inbox', text: 'Ticket received & classified' },
            { step: '2', icon: 'person_search', text: 'Expert assigned to your case' },
            { step: '3', icon: 'chat', text: 'Response via email or portal' },
          ].map(({ step, icon, text }) => (
            <div
              key={step}
              className="flex items-center gap-3 p-3 rounded-DEFAULT bg-surface-container ghost-border"
            >
              <span className="w-6 h-6 rounded-full bg-primary-container text-primary flex items-center justify-center font-label text-xs font-bold flex-shrink-0">
                {step}
              </span>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                  {icon}
                </span>
                <span className="font-body text-xs text-on-surface-variant">{text}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div className="flex flex-col sm:flex-row justify-center gap-3">
        <Link
          href="/"
          className="btn-gradient text-on-primary font-label font-semibold text-base py-4 px-10 rounded-xl flex items-center gap-3 justify-center"
        >
          Return to Support Hub
          <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
        </Link>
        {ticketId && (
          <Link
            href={`/contact?ticket=${ticketId}`}
            className="bg-surface-container text-on-surface-variant ghost-border font-label font-semibold text-sm py-4 px-8 rounded-xl flex items-center gap-2 justify-center hover:bg-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">open_in_new</span>
            View Ticket #{ticketId}
          </Link>
        )}
      </div>
    </div>
  )
}
