import Link from 'next/link'
import { cn } from '@/lib/cn'

const BENTO_ITEMS = [
  {
    key: 'ai-analysis',
    title: 'AI Analysis Engine',
    description:
      'Learn how to configure sentiment models and extract deep qualitative insights from open-text responses.',
    icon: 'model_training',
    iconBg: 'bg-secondary-container',
    iconColor: 'text-on-secondary-container',
    span: 'md:col-span-2',
    articles: 12,
    videos: 3,
    href: '/guides?category=ai-analysis',
  },
  {
    key: 'nps-automation',
    title: 'NPS Automation',
    description: 'Trigger logic, benchmarking, and automated pulse surveys.',
    icon: 'speed',
    iconBg: 'bg-tertiary-container',
    iconColor: 'text-on-tertiary-container',
    span: '',
    articles: 8,
    videos: undefined,
    href: '/guides?category=nps-automation',
  },
  {
    key: 'api-integrations',
    title: 'API & Integrations',
    description: 'Connect Xperiq to your entire tech stack.',
    icon: 'api',
    iconBg: 'bg-surface-container-high',
    iconColor: 'text-on-surface',
    span: '',
    articles: 15,
    videos: undefined,
    href: '/guides?category=api-integrations',
  },
  {
    key: 'data-privacy',
    title: 'Data & Privacy',
    description: 'Compliance controls, access management, and GDPR.',
    icon: 'security',
    iconBg: 'bg-surface-container-high',
    iconColor: 'text-on-surface',
    span: '',
    articles: 6,
    videos: undefined,
    href: '/guides?category=data-privacy',
  },
] as const

export function KnowledgeBento() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6 auto-rows-[200px]">
      {BENTO_ITEMS.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          className={cn(
            'rounded-lg bg-surface-container-lowest p-6 ghost-border shadow-ambient interactive-card flex flex-col justify-between overflow-hidden relative group',
            item.span,
          )}
        >
          {/* Decorative corner for large card */}
          {item.span === 'md:col-span-2' && (
            <div className="absolute right-0 bottom-0 w-40 h-40 bg-primary/5 rounded-tl-[120px] transition-transform group-hover:scale-110" />
          )}

          <div>
            <div
              className={cn(
                'w-10 h-10 rounded-full flex items-center justify-center mb-4',
                item.iconBg,
              )}
            >
              <span
                className={cn('material-symbols-outlined', item.iconColor)}
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {item.icon}
              </span>
            </div>
            <h3 className="font-headline text-lg font-semibold text-on-background">
              {item.title}
            </h3>
            <p className="text-sm text-on-surface-variant mt-2 max-w-sm line-clamp-2">
              {item.description}
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-label font-medium text-outline">
            <span className="flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">article</span>
              {item.articles} Articles
            </span>
            {item.videos != null && (
              <span className="flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">play_circle</span>
                {item.videos} Videos
              </span>
            )}
          </div>
        </Link>
      ))}

      {/* CTA card */}
      <Link
        href="/contact"
        className="rounded-lg p-6 btn-gradient text-on-primary shadow-glow interactive-card flex flex-col justify-between relative overflow-hidden group cursor-pointer"
      >
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),transparent)]" />
        <div className="relative z-10">
          <span
            className="material-symbols-outlined text-3xl mb-2"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            support_agent
          </span>
          <h4 className="font-headline text-lg font-semibold mt-2">Still need help?</h4>
          <p className="text-sm opacity-90 mt-1">Connect with an enterprise specialist.</p>
        </div>
        <div className="relative z-10 flex items-center justify-between">
          <span className="text-sm font-semibold font-label">Open a ticket</span>
          <span className="material-symbols-outlined">arrow_forward</span>
        </div>
      </Link>
    </div>
  )
}
