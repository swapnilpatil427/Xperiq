import { cn } from '@/lib/cn'

interface Component {
  name: string
  status: 'operational' | 'degraded' | 'outage'
}

const STATUS_CONFIG = {
  operational: {
    label: 'Operational',
    icon: 'check_circle',
    color: 'text-secondary',
    bg: 'bg-secondary-container/20',
    dotClass: 'bg-secondary',
    dotAnimate: '',
  },
  degraded: {
    label: 'Degraded',
    icon: 'warning',
    color: 'text-[#f59e0b]',
    bg: 'bg-[#fef3c7]',
    dotClass: 'bg-[#f59e0b]',
    dotAnimate: 'animate-pulse',
  },
  outage: {
    label: 'Outage',
    icon: 'error',
    color: 'text-error',
    bg: 'bg-error-container/10',
    dotClass: 'bg-error',
    dotAnimate: 'animate-pulse',
  },
}

interface StatusGridProps {
  components: Component[]
}

export function StatusGrid({ components }: StatusGridProps) {
  // Summary counts
  const counts = {
    operational: components.filter(c => c.status === 'operational').length,
    degraded: components.filter(c => c.status === 'degraded').length,
    outage: components.filter(c => c.status === 'outage').length,
  }

  return (
    <div>
      {/* Summary row */}
      {(counts.degraded > 0 || counts.outage > 0) && (
        <div className="mb-6 p-4 rounded-DEFAULT bg-error-container/10 ghost-border flex items-center gap-3">
          <span
            className="material-symbols-outlined text-error text-[20px]"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            warning
          </span>
          <p className="font-body text-sm text-on-surface">
            {counts.outage > 0 && (
              <span className="font-semibold text-error">{counts.outage} service(s) experiencing outage. </span>
            )}
            {counts.degraded > 0 && (
              <span className="font-semibold text-[#f59e0b]">{counts.degraded} service(s) degraded. </span>
            )}
            Our team is actively investigating.
          </p>
        </div>
      )}

      <h2 className="font-headline text-lg font-bold text-on-surface mb-4">Component Status</h2>

      <div className="space-y-3">
        {components.map(comp => {
          const config = STATUS_CONFIG[comp.status]
          return (
            <div
              key={comp.name}
              className="flex items-center justify-between p-4 rounded-DEFAULT bg-surface-container-lowest ghost-border shadow-ambient"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'w-2 h-2 rounded-full flex-shrink-0',
                    config.dotClass,
                    config.dotAnimate
                  )}
                />
                <span className="font-label text-sm font-medium text-on-surface">{comp.name}</span>
              </div>
              <div
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-label font-semibold',
                  config.bg,
                  config.color
                )}
              >
                <span
                  className="material-symbols-outlined text-[14px]"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  {config.icon}
                </span>
                {config.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Uptime note */}
      <div className="mt-8 flex items-center justify-center gap-6 text-sm font-label text-on-surface-variant">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-secondary" />
          <span>Operational ({counts.operational})</span>
        </div>
        {counts.degraded > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#f59e0b]" />
            <span>Degraded ({counts.degraded})</span>
          </div>
        )}
        {counts.outage > 0 && (
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-error" />
            <span>Outage ({counts.outage})</span>
          </div>
        )}
      </div>
    </div>
  )
}
