import dynamic from 'next/dynamic'
import { PageShell } from '@/components/layout/PageShell'
import { HeroSearch } from '@/components/home/HeroSearch'

// Three.js is ~500KB — lazy-load to keep initial bundle light
const NeuralMesh = dynamic(
  () => import('@/components/home/NeuralMesh').then(m => m.NeuralMesh),
  { ssr: false, loading: () => null }
)
import { KnowledgeBento } from '@/components/home/KnowledgeBento'
import { HowCrystalWorks } from '@/components/home/HowCrystalWorks'
import { TrustBar } from '@/components/home/TrustBar'
import { buildOrganizationJsonLd } from '@/lib/jsonld'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Support Intelligence — AI-Powered Help Center',
  description:
    'Get instant answers from Crystal AI, browse expert documentation, and connect with enterprise support specialists. The most intelligent XM support experience.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'Xperiq Support Intelligence',
    description: 'AI-powered help center for the leading enterprise XM platform',
    type: 'website',
  },
}

export default function HomePage() {
  const orgJsonLd = buildOrganizationJsonLd()

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(orgJsonLd) }}
      />

      {/* Background glow layer (atmospheric) */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-0 left-1/4 w-[800px] h-[600px] bg-primary/8 rounded-full blur-[140px] opacity-60" />
        <div className="absolute top-1/3 right-0 w-[600px] h-[600px] bg-tertiary/5 rounded-full blur-[120px] opacity-40" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[400px] h-[400px] bg-secondary/5 rounded-full blur-[100px] opacity-30" />
      </div>

      {/* Three.js neural mesh background — lazy-loaded, client-only */}
      <NeuralMesh />

      <div className="relative z-10">
        {/* Hero section */}
        <section className="min-h-[85vh] flex flex-col items-center justify-center px-6 pt-8 pb-16">
          <div className="text-center mb-12 max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-surface-container ghost-border text-sm font-label text-on-surface-variant mb-8 animate-fade-in">
              <span
                className="material-symbols-outlined text-[16px] text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                auto_awesome
              </span>
              Powered by Crystal AI
            </div>

            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-extrabold text-on-background leading-none tracking-tight mb-6 animate-fade-up">
              Support{' '}
              <span className="gradient-text">Intelligence</span>
            </h1>

            <p
              className="font-body text-lg md:text-xl text-on-surface-variant max-w-2xl mx-auto leading-relaxed animate-fade-up"
              style={{ animationDelay: '0.1s' }}
            >
              Ask Crystal anything about your Xperiq workflows, data analysis, or platform
              capabilities. Get enterprise-grade answers in seconds.
            </p>
          </div>

          <HeroSearch />
        </section>

        {/* Trust bar */}
        <TrustBar />

        {/* How Crystal Works */}
        <HowCrystalWorks />

        {/* Knowledge Areas */}
        <section className="py-20 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-2 mb-8">
              <span
                className="material-symbols-outlined text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                library_books
              </span>
              <h2 className="font-headline text-2xl font-bold text-on-background">
                Browse Knowledge Areas
              </h2>
            </div>
            <KnowledgeBento />
          </div>
        </section>
      </div>
    </PageShell>
  )
}
