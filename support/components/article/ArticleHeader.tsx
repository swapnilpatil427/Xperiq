import { Badge } from '@/components/ui/Badge'
import { formatDate, CATEGORIES } from '@/lib/seo'
import type { SupportDoc } from '@/lib/api'

interface ArticleHeaderProps {
  doc: SupportDoc
}

export function ArticleHeader({ doc }: ArticleHeaderProps) {
  const category = CATEGORIES.find(c => c.key === doc.category)

  return (
    <header className="mb-10">
      <div className="flex items-center gap-3 mb-5">
        {doc.status !== 'auto_approved' && doc.status !== 'live' && (
          <Badge variant="beta">Beta</Badge>
        )}
        {category && (
          <span className="text-sm text-on-surface-variant font-label">{category.label}</span>
        )}
        {doc.updated_at && (
          <span className="text-sm text-outline font-label">
            Updated {formatDate(doc.updated_at)}
          </span>
        )}
      </div>

      <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight text-on-surface mb-5 leading-tight">
        {doc.title}
      </h1>

      <p className="font-body text-lg md:text-xl text-on-surface-variant leading-relaxed max-w-3xl">
        {doc.summary}
      </p>
    </header>
  )
}
