import Link from 'next/link'
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getDocs, type SupportDoc } from '@/lib/api'
import { CATEGORIES } from '@/lib/seo'
import { cn } from '@/lib/cn'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Documentation & Guides',
  description: 'Browse all Xperiq documentation, how-to guides, API references, and integration tutorials.',
  alternates: { canonical: '/guides' },
}

export default async function GuidesPage({
  searchParams,
}: {
  searchParams: { category?: string }
}) {
  let docs: SupportDoc[] = []
  try {
    docs = await getDocs(searchParams.category)
  } catch {}

  const selectedCategory = searchParams.category

  return (
    <PageShell>
      {/* Background glow */}
      <div className="absolute top-16 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto px-6 py-16 relative z-10">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-display text-5xl font-extrabold text-on-background tracking-tight mb-4">
            Documentation
          </h1>
          <p className="text-on-surface-variant font-body text-lg max-w-2xl">
            Everything you need to build, analyze, and scale with Xperiq.
          </p>
        </div>

        {/* Category filter chips */}
        <div className="flex flex-wrap gap-2 mb-12">
          <Link
            href="/guides"
            className={cn(
              'px-4 py-1.5 rounded-full font-label text-sm font-medium transition-all duration-200 ghost-border',
              !selectedCategory
                ? 'bg-primary text-on-primary shadow-glow'
                : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            )}
          >
            All
          </Link>
          {CATEGORIES.map(cat => (
            <Link
              key={cat.key}
              href={`/guides?category=${cat.key}`}
              className={cn(
                'inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full font-label text-sm font-medium transition-all duration-200 ghost-border',
                selectedCategory === cat.key
                  ? 'bg-primary text-on-primary shadow-glow'
                  : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
              )}
            >
              <span className="material-symbols-outlined text-[14px]">{cat.icon}</span>
              {cat.label}
            </Link>
          ))}
        </div>

        {/* Category cards grid (when no filter) */}
        {!selectedCategory && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
            {CATEGORIES.map(cat => (
              <Link
                key={cat.key}
                href={`/guides?category=${cat.key}`}
                className="p-6 rounded-lg bg-surface-container-lowest ghost-border shadow-ambient interactive-card flex items-start gap-4 group"
              >
                <div className="w-10 h-10 rounded-full bg-surface-container flex items-center justify-center flex-shrink-0">
                  <span
                    className="material-symbols-outlined text-primary group-hover:text-primary-dim transition-colors"
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {cat.icon}
                  </span>
                </div>
                <div>
                  <h3 className="font-headline text-base font-semibold text-on-surface group-hover:text-primary transition-colors">
                    {cat.label}
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-1 font-label">Browse guides &rarr;</p>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Articles list */}
        {docs.length > 0 ? (
          <div className="space-y-4">
            <h2 className="font-headline text-xl font-bold text-on-surface mb-6">
              {selectedCategory
                ? CATEGORIES.find(c => c.key === selectedCategory)?.label ?? 'Articles'
                : 'All Articles'}
            </h2>
            {docs.map(doc => (
              <Link
                key={doc.id}
                href={`/guides/${doc.doc_key}`}
                className="block p-5 rounded-lg bg-surface-container-lowest ghost-border shadow-ambient hover:shadow-glow transition-shadow group"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-headline text-base font-semibold text-on-surface group-hover:text-primary transition-colors mb-1 truncate">
                      {doc.title}
                    </h3>
                    <p className="font-body text-sm text-on-surface-variant line-clamp-2">{doc.summary}</p>
                    <div className="flex items-center gap-3 mt-3">
                      {doc.tags?.slice(0, 3).map(tag => (
                        <span
                          key={tag}
                          className="text-xs font-label text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors flex-shrink-0">
                    arrow_forward
                  </span>
                </div>
              </Link>
            ))}
          </div>
        ) : selectedCategory ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-4 block">
              search_off
            </span>
            <h3 className="font-headline text-xl font-semibold text-on-surface mb-2">
              No articles in this category yet
            </h3>
            <p className="font-body text-on-surface-variant mb-6">
              We&apos;re adding new guides regularly. Check back soon or browse another category.
            </p>
            <Link
              href="/guides"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-on-primary font-label text-sm font-medium hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>
              Browse all categories
            </Link>
          </div>
        ) : null}
      </div>
    </PageShell>
  )
}
