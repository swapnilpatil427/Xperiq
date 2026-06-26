import Link from 'next/link'
import { searchDocs } from '@/lib/api'
import type { SupportDoc } from '@/lib/api'
import { cn } from '@/lib/cn'

interface SearchResultsProps {
  query: string
  mode?: string
}

export async function SearchResults({ query }: SearchResultsProps) {
  if (!query) {
    return (
      <div>
        <h1 className="font-display text-3xl font-extrabold text-on-background tracking-tight mb-2">
          Search Documentation
        </h1>
      </div>
    )
  }

  let results: SupportDoc[] = []
  try {
    results = await searchDocs(query)
  } catch {}

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display text-3xl font-extrabold text-on-background tracking-tight mb-2">
          Results for &ldquo;{query}&rdquo;
        </h1>
        <p className="font-body text-on-surface-variant">
          {results.length} result{results.length !== 1 ? 's' : ''} found
        </p>
      </div>

      {results.length === 0 ? (
        <div className="text-center py-20 bg-surface-container-lowest rounded-lg ghost-border shadow-ambient">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant mb-4 block">
            search_off
          </span>
          <h2 className="font-headline text-xl font-semibold text-on-surface mb-2">
            No results found
          </h2>
          <p className="font-body text-on-surface-variant mb-6">
            Try different keywords or{' '}
            <Link href="/contact" className="text-primary hover:underline">
              contact support
            </Link>
            .
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {results.map(doc => (
            <Link
              key={doc.id}
              href={`/guides/${doc.doc_key}`}
              className={cn(
                'block p-5 rounded-lg bg-surface-container-lowest ghost-border',
                'shadow-ambient hover:shadow-glow transition-shadow group',
              )}
            >
              <h3 className="font-headline text-base font-semibold text-on-surface group-hover:text-primary transition-colors mb-2">
                {doc.title}
              </h3>
              <p className="font-body text-sm text-on-surface-variant line-clamp-2">
                {doc.summary}
              </p>
              <div className="flex items-center gap-2 mt-3 text-xs font-label text-outline">
                {doc.category && <span>{doc.category}</span>}
                {doc.updated_at && (
                  <>
                    <span>&middot;</span>
                    <span>
                      Updated{' '}
                      {new Date(doc.updated_at).toLocaleDateString('en-US', {
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  </>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
