import { CodeBlock } from '@/components/ui/CodeBlock'
import type { SupportDoc } from '@/lib/api'

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '-')
}

function renderContent(content: string) {
  const paragraphs = content.split('\n\n')
  return paragraphs.map((p, i) => {
    // Fenced code blocks
    if (p.startsWith('```')) {
      const lines = p.split('\n')
      const lang = lines[0].slice(3).trim() || 'text'
      const code = lines.slice(1, -1).join('\n')
      return <CodeBlock key={i} code={code} language={lang} />
    }

    // Headings
    if (p.startsWith('### ')) {
      return (
        <h4
          key={i}
          id={slugify(p.slice(4))}
          className="font-headline text-lg font-semibold text-on-surface mt-6 mb-2 scroll-mt-24"
        >
          {p.slice(4)}
        </h4>
      )
    }
    if (p.startsWith('## ')) {
      return (
        <h3
          key={i}
          id={slugify(p.slice(3))}
          className="font-headline text-xl font-semibold text-on-surface mt-8 mb-3 scroll-mt-24"
        >
          {p.slice(3)}
        </h3>
      )
    }
    if (p.startsWith('# ')) {
      return (
        <h2
          key={i}
          id={slugify(p.slice(2))}
          className="font-headline text-2xl font-bold text-on-surface mt-10 mb-4 scroll-mt-24"
        >
          {p.slice(2)}
        </h2>
      )
    }

    // Unordered lists
    if (p.startsWith('- ') || p.startsWith('* ')) {
      const items = p.split('\n').filter(l => l.startsWith('- ') || l.startsWith('* '))
      return (
        <ul key={i} className="list-none space-y-2 my-4">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 font-body text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-primary mt-0.5 flex-shrink-0">
                chevron_right
              </span>
              <span>{item.slice(2)}</span>
            </li>
          ))}
        </ul>
      )
    }

    // Default paragraph
    return (
      <p key={i} className="font-body text-on-surface-variant leading-relaxed my-4">
        {p}
      </p>
    )
  })
}

export function ArticleContent({ doc }: { doc: SupportDoc }) {
  const { sections, content } = doc

  if (sections && sections.length > 0) {
    return (
      <div className="prose-content">
        {sections.map(section => (
          <section key={section.id} className="mb-10">
            <h2
              id={section.anchor}
              className="font-headline text-2xl font-bold text-on-surface mb-4 scroll-mt-24"
            >
              {section.heading}
            </h2>
            <div className="font-body text-on-surface-variant leading-relaxed space-y-4">
              {renderContent(section.content)}
            </div>
          </section>
        ))}
      </div>
    )
  }

  return (
    <div className="font-body text-on-surface-variant leading-relaxed space-y-4">
      {content ? (
        renderContent(content)
      ) : (
        <p className="text-on-surface-variant italic">No content available yet.</p>
      )}
    </div>
  )
}
