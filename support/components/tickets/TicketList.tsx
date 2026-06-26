import type { Ticket } from '@/app/my-tickets/page'
import { cn } from '@/lib/cn'

const STATUS_CONFIG = {
  open:        { label: 'Open',        color: 'text-primary',   bg: 'bg-primary-container/20',   icon: 'radio_button_unchecked' },
  in_progress: { label: 'In Progress', color: 'text-[#f59e0b]', bg: 'bg-amber-500/10',           icon: 'pending' },
  resolved:    { label: 'Resolved',    color: 'text-secondary', bg: 'bg-secondary-container/20', icon: 'check_circle' },
  closed:      { label: 'Closed',      color: 'text-outline',   bg: 'bg-surface-container',      icon: 'cancel' },
}

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', color: 'text-error',      bg: 'bg-error-container/15' },
  high:     { label: 'High',     color: 'text-[#f59e0b]',  bg: 'bg-amber-500/10' },
  medium:   { label: 'Medium',   color: 'text-primary',    bg: 'bg-primary-container/20' },
  low:      { label: 'Low',      color: 'text-outline',    bg: 'bg-surface-container' },
}

interface Props {
  tickets: Ticket[]
}

export function TicketList({ tickets }: Props) {
  if (tickets.length === 0) {
    return (
      <div className="text-center py-16 bg-surface-container-lowest rounded-lg ghost-border shadow-ambient">
        <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-3 block">
          inbox
        </span>
        <h3 className="font-headline text-lg font-semibold text-on-surface mb-2">
          No tickets yet
        </h3>
        <p className="font-body text-sm text-on-surface-variant">
          Submit a request using the form and we&apos;ll get back to you.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <h2 className="font-headline text-base font-semibold text-on-surface mb-4">
        {tickets.length} ticket{tickets.length !== 1 ? 's' : ''}
      </h2>
      {tickets.map((ticket) => {
        const status  = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open
        const sev     = SEVERITY_CONFIG[ticket.severity as keyof typeof SEVERITY_CONFIG] ?? SEVERITY_CONFIG.medium
        return (
          <div
            key={ticket.id}
            className="p-5 rounded-lg bg-surface-container-lowest ghost-border shadow-ambient"
          >
            <div className="flex items-start justify-between gap-3 mb-2">
              <h3 className="font-headline text-sm font-semibold text-on-surface leading-snug flex-1 min-w-0 truncate">
                {ticket.subject}
              </h3>
              <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-label text-xs font-semibold shrink-0', status.color, status.bg)}>
                <span className="material-symbols-outlined text-[12px]">{status.icon}</span>
                {status.label}
              </span>
            </div>

            {ticket.body && (
              <p className="font-body text-xs text-on-surface-variant line-clamp-2 mb-3">
                {ticket.body}
              </p>
            )}

            {ticket.resolution && ticket.status === 'resolved' && (
              <div className="mt-2 mb-3 p-3 rounded-md bg-secondary-container/15 border border-secondary-container/30">
                <p className="font-label text-xs font-semibold text-secondary mb-1">Resolution</p>
                <p className="font-body text-xs text-on-surface-variant line-clamp-3">{ticket.resolution}</p>
              </div>
            )}

            <div className="flex items-center gap-3 text-xs font-label text-outline">
              <span className={cn('px-2 py-0.5 rounded-full', sev.color, sev.bg)}>
                {sev.label}
              </span>
              <span>&middot;</span>
              <span>
                {new Date(ticket.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
