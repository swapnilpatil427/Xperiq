import type { RoadmapItem } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { cn } from '@/lib/cn'

const STATUS_CONFIG = {
  planned: {
    label: 'Planned',
    icon: 'schedule',
    color: 'text-on-surface-variant',
    bg: 'bg-surface-container',
    badgeVariant: 'outline' as const,
  },
  in_progress: {
    label: 'In Progress',
    icon: 'pending',
    color: 'text-primary',
    bg: 'bg-primary-container/10',
    badgeVariant: 'primary' as const,
  },
  shipped: {
    label: 'Shipped',
    icon: 'check_circle',
    color: 'text-secondary',
    bg: 'bg-secondary-container/20',
    badgeVariant: 'secondary' as const,
  },
}

const MOCK_ITEMS: RoadmapItem[] = [
  {
    id: '1',
    title: 'Crystal AI for mobile',
    description: "Bring Crystal's full intelligence to iOS and Android apps",
    status: 'in_progress',
    quarter: 'Q3 2026',
    category: 'AI',
  },
  {
    id: '2',
    title: 'Custom metric builder',
    description: 'Build and track custom experience metrics beyond NPS/CSAT',
    status: 'planned',
    quarter: 'Q4 2026',
    category: 'Analytics',
  },
  {
    id: '3',
    title: 'Webhooks 2.0',
    description: 'Real-time event webhooks with retry logic and filtering',
    status: 'shipped',
    quarter: 'Q2 2026',
    category: 'API',
  },
  {
    id: '4',
    title: 'Multi-org Crystal context',
    description: 'Share Crystal insights across org units with privacy controls',
    status: 'planned',
    quarter: 'Q4 2026',
    category: 'AI',
  },
  {
    id: '5',
    title: 'Slack integration',
    description: 'Receive Crystal insights and survey alerts directly in Slack',
    status: 'in_progress',
    quarter: 'Q3 2026',
    category: 'Integrations',
  },
  {
    id: '6',
    title: 'Response anonymization',
    description: 'Auto-anonymize PII in survey responses for GDPR compliance',
    status: 'shipped',
    quarter: 'Q2 2026',
    category: 'Privacy',
  },
]

interface RoadmapBoardProps {
  items: RoadmapItem[]
}

export function RoadmapBoard({ items }: RoadmapBoardProps) {
  const displayItems = items.length > 0 ? items : MOCK_ITEMS

  const statuses = ['planned', 'in_progress', 'shipped'] as const

  return (
    <div className="grid md:grid-cols-3 gap-6">
      {statuses.map(status => {
        const config = STATUS_CONFIG[status]
        const statusItems = displayItems.filter(i => i.status === status)

        return (
          <div key={status} className="space-y-4">
            {/* Column header */}
            <div className={cn('flex items-center gap-2 px-4 py-3 rounded-DEFAULT', config.bg)}>
              <span
                className={cn('material-symbols-outlined text-[20px]', config.color)}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {config.icon}
              </span>
              <h2 className={cn('font-headline text-base font-bold', config.color)}>
                {config.label}
              </h2>
              <span className="ml-auto font-label text-sm text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                {statusItems.length}
              </span>
            </div>

            {/* Items */}
            <div className="space-y-3">
              {statusItems.map(item => (
                <div
                  key={item.id}
                  className="p-5 rounded-DEFAULT bg-surface-container-lowest ghost-border shadow-ambient interactive-card group"
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <h3 className="font-headline text-sm font-semibold text-on-surface leading-snug">
                      {item.title}
                    </h3>
                    <Badge variant={config.badgeVariant} size="sm">
                      {item.quarter}
                    </Badge>
                  </div>
                  <p className="font-body text-xs text-on-surface-variant leading-relaxed">
                    {item.description}
                  </p>
                  {item.category && (
                    <div className="mt-3 flex items-center gap-1.5">
                      <span className="text-xs font-label text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
                        {item.category}
                      </span>
                    </div>
                  )}
                </div>
              ))}

              {statusItems.length === 0 && (
                <div className="p-6 text-center text-sm text-on-surface-variant font-body rounded-DEFAULT bg-surface-container/40 border border-dashed border-outline-variant/40">
                  Nothing here yet
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
