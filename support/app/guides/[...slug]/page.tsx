import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PageShell } from '@/components/layout/PageShell'
import { ArticleHeader } from '@/components/article/ArticleHeader'
import { ArticleContent } from '@/components/article/ArticleContent'
import { TableOfContents } from '@/components/article/TableOfContents'
import { AIDraftBadge } from '@/components/article/AIDraftBadge'
import { ArticleFeedback } from '@/components/article/ArticleFeedback'
import { CrystalPanel } from '@/components/crystal/CrystalPanel'
import { getDoc, getDocs, type SupportDoc } from '@/lib/api'
import { buildTechArticleJsonLd, buildBreadcrumbJsonLd } from '@/lib/jsonld'
import { CATEGORIES } from '@/lib/seo'

export const revalidate = 3600

export async function generateStaticParams() {
  try {
    const docs = await getDocs()
    return docs.map(doc => ({
      slug: doc.doc_key.split('/'),
    }))
  } catch {
    return []
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string[] }
}): Promise<Metadata> {
  const key = params.slug.join('/')
  try {
    const doc = await getDoc(key)
    return {
      title: doc.title,
      description: doc.summary,
      alternates: { canonical: `/guides/${key}` },
      openGraph: {
        title: doc.title,
        description: doc.summary,
        type: 'article',
        publishedTime: doc.published_at || undefined,
        modifiedTime: doc.updated_at,
      },
    }
  } catch {
    return { title: 'Article Not Found' }
  }
}

export default async function ArticlePage({
  params,
}: {
  params: { slug: string[] }
}) {
  const key = params.slug.join('/')

  let doc: SupportDoc | undefined
  try {
    doc = await getDoc(key)
  } catch {
    notFound()
  }
  if (!doc) notFound()

  const category = CATEGORIES.find(c => c.key === doc.category)
  const articleJsonLd = buildTechArticleJsonLd(doc)
  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Support', url: 'https://support.experient.ai' },
    { name: 'Guides', url: 'https://support.experient.ai/guides' },
    ...(category
      ? [{ name: category.label, url: `https://support.experient.ai/guides?category=${doc.category}` }]
      : []),
    { name: doc.title, url: `https://support.experient.ai/guides/${doc.doc_key}` },
  ])

  return (
    <PageShell>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />

      <div className="max-w-7xl mx-auto px-4 py-12">
        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-2 text-sm font-label text-on-surface-variant mb-8"
          aria-label="Breadcrumb"
        >
          <a href="/guides" className="hover:text-primary transition-colors">
            Guides
          </a>
          {category && (
            <>
              <span className="material-symbols-outlined text-[14px]">chevron_right</span>
              <a
                href={`/guides?category=${doc.category}`}
                className="hover:text-primary transition-colors"
              >
                {category.label}
              </a>
            </>
          )}
          <span className="material-symbols-outlined text-[14px]">chevron_right</span>
          <span className="text-on-surface truncate max-w-[200px]">{doc.title}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr_280px] gap-8">
          {/* Left: Table of Contents */}
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TableOfContents sections={doc.sections || []} />
            </div>
          </aside>

          {/* Center: Article */}
          <article className="min-w-0">
            <ArticleHeader doc={doc} />
            {doc.ai_draft && (
              <AIDraftBadge reviewedAt={doc.human_reviewed_at} />
            )}
            <ArticleContent doc={doc} />
            <ArticleFeedback docKey={doc.doc_key} />
          </article>

          {/* Right: Crystal Panel */}
          <aside className="hidden lg:block">
            <div className="sticky top-24 space-y-4">
              <CrystalPanel docKey={doc.doc_key} docTitle={doc.title} />
            </div>
          </aside>
        </div>
      </div>
    </PageShell>
  )
}
