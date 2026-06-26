import { Badge } from '@/components/ui/Badge'
import { formatDate } from '@/lib/seo'
import type { ChangelogEntry as ChangelogEntryType } from '@/lib/api'

const TYPE_CONFIG = {
  feature: {
    label: 'New Feature',
    variant: 'primary' as const,
    icon: 'auto_awesome',
  },
  fix: {
    label: 'Bug Fix',
    variant: 'error' as const,
    icon: 'bug_report',
  },
  improvement: {
    label: 'Improvement',
    variant: 'secondary' as const,
    icon: 'arrow_upward',
  },
  breaking: {
    label: 'Breaking Change',
    variant: 'error' as const,
    icon: 'warning',
  },
}

interface ChangelogEntryProps {
  entry: ChangelogEntryType
}

export function ChangelogEntry({ entry }: ChangelogEntryProps) {
  const config = TYPE_CONFIG[entry.type] ?? TYPE_CONFIG.feature

  return (
    <article className="relative">
      {/* Timeline dot */}
      <div className="absolute -left-[2.75rem] top-7 w-3 h-3 rounded-full bg-primary-container ring-4 ring-surface" />

      <div className="p-6 rounded-lg bg-surface-container-lowest ghost-border shadow-ambient">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="font-mono text-xs font-bold text-on-surface-variant bg-surface-container px-2 py-1 rounded">
            v{entry.version}
          </span>
          <Badge variant={config.variant} size="sm">
            <span className="material-symbols-outlined text-[12px] mr-1">{config.icon}</span>
            {config.label}
          </Badge>
          <time className="font-label text-xs text-outline ml-auto" dateTime={entry.published_at}>
            {formatDate(entry.published_at)}
          </time>
        </div>

        <h2 className="font-headline text-xl font-bold text-on-surface mb-4">{entry.title}</h2>

        <div className="font-body text-on-surface-variant leading-relaxed space-y-3">
          {entry.body.split('\n\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
      </div>
    </article>
  )
}
