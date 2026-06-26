import Link from 'next/link'
import { PageShell } from '@/components/layout/PageShell'

export default function NotFound() {
  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-6 py-24 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-surface-container ghost-border mb-8">
          <span
            className="material-symbols-outlined text-4xl text-on-surface-variant"
            style={{ fontVariationSettings: "'FILL' 0" }}
          >
            search_off
          </span>
        </div>
        <h1 className="font-display text-5xl font-extrabold text-on-background tracking-tight mb-4">
          Page not found
        </h1>
        <p className="font-body text-lg text-on-surface-variant mb-10">
          The page you&apos;re looking for doesn&apos;t exist or has been moved. Try searching
          for what you need.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 btn-gradient text-on-primary px-6 py-3 rounded-xl font-label font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">home</span>
            Go home
          </Link>
          <Link
            href="/guides"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-label font-semibold ghost-border bg-surface-container text-on-surface hover:bg-surface-container-high transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">menu_book</span>
            Browse guides
          </Link>
        </div>
      </div>
    </PageShell>
  )
}
