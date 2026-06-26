import { Suspense } from 'react'
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { SearchResults } from '@/components/search/SearchResults'

export const metadata: Metadata = {
  title: 'Search',
  description: 'Search Experient documentation and get AI-powered answers from Crystal.',
  robots: { index: false },
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string; mode?: string }
}) {
  return (
    <PageShell>
      <div className="max-w-7xl mx-auto px-6 py-12">
        <Suspense fallback={<SearchSkeleton />}>
          <SearchResults query={searchParams.q || ''} mode={searchParams.mode} />
        </Suspense>
      </div>
    </PageShell>
  )
}

function SearchSkeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-8 bg-surface-container rounded-DEFAULT w-1/3" />
      {[1, 2, 3].map(i => (
        <div key={i} className="h-20 bg-surface-container rounded-DEFAULT" />
      ))}
    </div>
  )
}
