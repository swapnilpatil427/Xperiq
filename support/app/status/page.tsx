import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getSystemStatus, type SystemStatus } from '@/lib/api'
import { StatusOrb } from '@/components/status/StatusOrb'
import { StatusGrid } from '@/components/status/StatusGrid'

export const revalidate = 60

export const metadata: Metadata = {
  title: 'System Status',
  description:
    'Real-time system status for Xperiq services. Check uptime, incidents, and maintenance windows.',
  alternates: { canonical: '/status' },
}

const DEFAULT_STATUS: SystemStatus = {
  status: 'operational',
  message: 'All systems operational',
  components: [
    { name: 'API', status: 'operational' },
    { name: 'Crystal AI', status: 'operational' },
    { name: 'Survey Collection', status: 'operational' },
    { name: 'Analytics Pipeline', status: 'operational' },
    { name: 'Webhooks', status: 'operational' },
    { name: 'CrystalOS', status: 'operational' },
  ],
  updated_at: new Date().toISOString(),
}

export default async function StatusPage() {
  let status: SystemStatus = DEFAULT_STATUS

  try {
    status = await getSystemStatus()
  } catch {}

  const headlineText = {
    operational: 'All Systems Operational',
    degraded: 'Partial Service Degradation',
    outage: 'Service Disruption',
  }[status.status]

  const headlineColor = {
    operational: 'text-secondary',
    degraded: 'text-[#f59e0b]',
    outage: 'text-error',
  }[status.status]

  return (
    <PageShell>
      <div className="max-w-4xl mx-auto px-6 py-16">
        {/* Orb + headline */}
        <div className="text-center mb-16">
          <StatusOrb status={status.status} />

          <h1 className={`font-display text-4xl font-extrabold tracking-tight mt-8 mb-3 ${headlineColor}`}>
            {headlineText}
          </h1>

          <p className="font-body text-on-surface-variant text-lg">{status.message}</p>

          <p className="font-label text-xs text-outline mt-3">
            Last updated:{' '}
            {new Date(status.updated_at).toLocaleString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
              timeZoneName: 'short',
            })}
          </p>
        </div>

        {/* Components grid */}
        <StatusGrid components={status.components} />

        {/* Subscribe / incident history */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-center gap-4">
          <div className="text-center sm:text-left">
            <p className="font-body text-sm text-on-surface-variant">
              View full incident history at{' '}
              <a
                href="https://status.xperiq.ai"
                className="text-primary hover:underline font-medium"
              >
                status.xperiq.ai
              </a>
            </p>
          </div>
          <div className="hidden sm:block w-px h-4 bg-outline-variant/40" />
          <a
            href="/contact?type=technical"
            className="font-label text-sm text-on-surface-variant hover:text-on-surface transition-colors"
          >
            Report an issue
          </a>
        </div>
      </div>
    </PageShell>
  )
}
