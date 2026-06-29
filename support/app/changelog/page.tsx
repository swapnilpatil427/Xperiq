import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getChangelog, type ChangelogEntry as ChangelogEntryType } from '@/lib/api'
import { ChangelogEntry } from '@/components/changelog/ChangelogEntry'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Changelog',
  description:
    'Product updates, new features, bug fixes, and improvements to the Xperiq platform.',
  alternates: { canonical: '/changelog' },
}

const MOCK_ENTRIES = [
  {
    id: '1',
    version: '2.4.0',
    title: 'Crystal AI v2 — Reasoning Transparency',
    body: "Crystal now shows its reasoning steps as it analyzes your data. You can see exactly which surveys, metrics, and signals it consulted before generating an insight.\n\nNew support for multi-turn conversations with full context retention across sessions.",
    type: 'feature' as const,
    published_at: '2026-06-15T00:00:00Z',
  },
  {
    id: '2',
    version: '2.3.5',
    title: 'Webhook reliability improvements',
    body: 'Fixed edge case causing webhook retries to fail silently after 3 attempts. Improved event ordering guarantees for high-volume orgs.',
    type: 'fix' as const,
    published_at: '2026-06-08T00:00:00Z',
  },
  {
    id: '3',
    version: '2.3.0',
    title: 'NPS Automation: Time-based triggers',
    body: 'You can now trigger NPS pulse surveys automatically based on customer milestones: 30/60/90 day post-onboarding, post-support-resolution, and post-renewal.',
    type: 'feature' as const,
    published_at: '2026-05-28T00:00:00Z',
  },
  {
    id: '4',
    version: '2.2.0',
    title: 'Crystal action proposals — closed-loop execution',
    body: 'Crystal can now propose concrete actions (send a survey, update a segment, trigger a workflow) based on its analysis. You review and confirm each proposal — nothing executes without your sign-off.',
    type: 'feature' as const,
    published_at: '2026-05-10T00:00:00Z',
  },
  {
    id: '5',
    version: '2.1.3',
    title: 'Analytics dashboard performance',
    body: 'Reduced initial dashboard load time by 40% through incremental data loading and smarter cache invalidation. Report exports now generate in the background and notify when ready.',
    type: 'improvement' as const,
    published_at: '2026-04-22T00:00:00Z',
  },
]

export default async function ChangelogPage() {
  let entries: ChangelogEntryType[] = []
  try {
    entries = await getChangelog()
  } catch {}

  const displayEntries = entries.length > 0 ? entries : MOCK_ENTRIES

  return (
    <PageShell>
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container ghost-border text-sm font-label text-on-surface-variant mb-6">
            <span
              className="material-symbols-outlined text-[16px] text-primary"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              update
            </span>
            Release Notes
          </div>
          <h1 className="font-display text-5xl font-extrabold text-on-background tracking-tight mb-4">
            Changelog
          </h1>
          <p className="font-body text-lg text-on-surface-variant">
            Every update, improvement, and fix — documented here.
          </p>
        </div>

        {/* Type legend */}
        <div className="flex flex-wrap items-center gap-3 mb-10">
          {[
            { label: 'New Feature', icon: 'auto_awesome', color: 'text-primary', bg: 'bg-primary-container/20' },
            { label: 'Bug Fix', icon: 'bug_report', color: 'text-error', bg: 'bg-error-container/10' },
            { label: 'Improvement', icon: 'arrow_upward', color: 'text-secondary', bg: 'bg-secondary-container/20' },
          ].map(({ label, icon, color, bg }) => (
            <span
              key={label}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-label text-xs font-semibold ${bg} ${color}`}
            >
              <span className="material-symbols-outlined text-[13px]">{icon}</span>
              {label}
            </span>
          ))}
        </div>

        {/* Timeline */}
        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-4 top-2 bottom-2 w-px bg-gradient-to-b from-primary-container via-surface-container to-transparent" />

          <div className="space-y-12 pl-12">
            {displayEntries.map(entry => (
              <ChangelogEntry key={entry.id} entry={entry} />
            ))}
          </div>
        </div>

        {/* RSS / subscribe CTA */}
        <div className="mt-16 p-8 rounded-lg bg-surface-container ghost-border text-center">
          <span
            className="material-symbols-outlined text-3xl text-primary mb-3 block"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            rss_feed
          </span>
          <h2 className="font-headline text-lg font-bold text-on-surface mb-2">
            Stay up to date
          </h2>
          <p className="font-body text-sm text-on-surface-variant mb-4">
            Subscribe to release notes to get notified about new features and fixes.
          </p>
          <a
            href="/api/changelog.rss"
            className="font-label text-sm font-semibold text-primary hover:underline inline-flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">rss_feed</span>
            Subscribe via RSS
          </a>
        </div>
      </div>
    </PageShell>
  )
}
