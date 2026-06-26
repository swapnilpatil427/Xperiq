import type { SupportDoc } from './api'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://support.experient.ai'

export function buildTechArticleJsonLd(doc: SupportDoc) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TechArticle',
    headline: doc.title,
    description: doc.summary,
    datePublished: doc.published_at || doc.updated_at,
    dateModified: doc.updated_at,
    author: {
      '@type': 'Organization',
      name: 'Experient',
      url: siteUrl,
    },
    publisher: {
      '@type': 'Organization',
      name: 'Experient',
      logo: { '@type': 'ImageObject', url: `${siteUrl}/logo.png` },
    },
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${siteUrl}/guides/${doc.doc_key}`,
    },
    articleSection: doc.category,
    keywords: doc.tags?.join(', '),
    ...(doc.ai_draft && {
      creditText: `AI-drafted, human-reviewed ${
        doc.human_reviewed_at
          ? new Date(doc.human_reviewed_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'long',
            })
          : ''
      }`,
    }),
  }
}

export function buildFAQJsonLd(questions: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }
}

export function buildBreadcrumbJsonLd(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }
}

export function buildOrganizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'Experient',
    url: 'https://experient.ai',
    logo: `${siteUrl}/logo.png`,
    sameAs: ['https://twitter.com/experient', 'https://linkedin.com/company/experient'],
    contactPoint: {
      '@type': 'ContactPoint',
      contactType: 'customer support',
      url: `${siteUrl}/contact`,
      availableLanguage: 'English',
    },
  }
}

/** Safe JSON-LD for dangerouslySetInnerHTML — escapes </script> in serialized output. */
export function jsonLdScript(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c')
}
