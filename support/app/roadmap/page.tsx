import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { getRoadmap, type RoadmapItem } from '@/lib/api'
import { RoadmapBoard } from '@/components/roadmap/RoadmapBoard'
import { buildOrganizationJsonLd, jsonLdScript } from '@/lib/jsonld'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'Product Roadmap',
  description:
    "See what we're building next. Track Xperiq's planned features, in-progress work, and recently shipped capabilities.",
  alternates: { canonical: '/roadmap' },
}

export default async function RoadmapPage() {
  let items: RoadmapItem[] = []
  try {
    items = await getRoadmap()
  } catch {}

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(buildOrganizationJsonLd()) }}
      />
      <PageShell>
        <div className="max-w-7xl mx-auto px-6 py-16">
          {/* Hero */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container ghost-border text-sm font-label text-on-surface-variant mb-6">
              <span
                className="material-symbols-outlined text-[16px] text-tertiary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                explore
              </span>
              Product Roadmap
            </div>
            <h1 className="font-display text-5xl font-extrabold text-on-background tracking-tight mb-4">
              What we&apos;re{' '}
              <span className="gradient-text">building</span>
            </h1>
            <p className="font-body text-lg text-on-surface-variant max-w-2xl mx-auto">
              Our public roadmap. Transparency is core to how we build with our customers.
            </p>
          </div>

          <RoadmapBoard items={items} />

          {/* Feature request CTA */}
          <div className="mt-20 text-center p-12 rounded-lg bg-surface-container-lowest ghost-border shadow-ambient">
            <span
              className="material-symbols-outlined text-5xl text-tertiary mb-4 block"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              add_circle
            </span>
            <h2 className="font-headline text-2xl font-bold text-on-surface mb-3">
              Have a feature request?
            </h2>
            <p className="font-body text-on-surface-variant mb-6 max-w-md mx-auto">
              We build with our customers. Submit a feature request and vote on what matters most.
            </p>
            <a
              href="/contact?type=feature-request"
              className="inline-flex btn-gradient text-on-primary px-8 py-3 rounded-xl font-label font-semibold items-center gap-2"
            >
              Submit a request
              <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
            </a>
          </div>
        </div>
      </PageShell>
    </>
  )
}
