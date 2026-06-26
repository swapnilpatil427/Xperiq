import { redirect } from 'next/navigation'
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { TicketList } from '@/components/tickets/TicketList'
import { NewTicketForm } from '@/components/tickets/NewTicketForm'
import { fetchAPIAuth } from '@/lib/api'

export const metadata: Metadata = {
  title: 'My Tickets',
  description: 'View and manage your support tickets.',
  robots: { index: false },
}

interface RawTicket {
  id: string
  title: string
  description: string
  severity: string
  status: string
  resolution: string | null
  created_at: string
  updated_at: string
}

export interface Ticket {
  id: string
  subject: string
  body: string
  severity: string
  status: 'open' | 'in_progress' | 'resolved' | 'closed'
  resolution: string | null
  created_at: string
  updated_at: string
}

export default async function MyTicketsPage() {
  // If Clerk is not configured, redirect away — page is unreachable without auth
  if (!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) redirect('/')

  const { auth } = await import('@clerk/nextjs/server')
  const { getToken, userId } = auth()
  if (!userId) redirect('/sign-in')

  const token = await getToken()

  let tickets: Ticket[] = []
  try {
    const data = await fetchAPIAuth<{ tickets: RawTicket[]; total: number }>(
      '/api/support/tickets',
      token!,
    )
    tickets = data.tickets.map((t) => ({
      id: t.id,
      subject: t.title,
      body: t.description,
      severity: t.severity,
      status: t.status as Ticket['status'],
      resolution: t.resolution,
      created_at: t.created_at,
      updated_at: t.updated_at,
    }))
  } catch {}

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container ghost-border text-sm font-label text-on-surface-variant mb-6">
            <span
              className="material-symbols-outlined text-[16px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              confirmation_number
            </span>
            Support Tickets
          </div>
          <h1 className="font-display text-4xl font-extrabold text-on-background tracking-tight mb-3">
            My Tickets
          </h1>
          <p className="font-body text-on-surface-variant text-lg">
            Track your open requests and escalations with the Experient support team.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Ticket list */}
          <div className="lg:col-span-2">
            <TicketList tickets={tickets} />
          </div>

          {/* New ticket form */}
          <div className="lg:col-span-1">
            <NewTicketForm />
          </div>
        </div>
      </div>
    </PageShell>
  )
}
