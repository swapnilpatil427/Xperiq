'use client'
import { useState, useEffect } from 'react'
import { cn } from '@/lib/cn'
import type { DocSection } from '@/lib/api'

interface TableOfContentsProps {
  sections: DocSection[]
}

export function TableOfContents({ sections }: TableOfContentsProps) {
  const [activeAnchor, setActiveAnchor] = useState<string>('')

  useEffect(() => {
    if (sections.length === 0) return

    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.find(e => e.isIntersecting)
        if (visible) setActiveAnchor(visible.target.id)
      },
      { rootMargin: '-80px 0px -60% 0px' }
    )

    sections.forEach(s => {
      const el = document.getElementById(s.anchor)
      if (el) observer.observe(el)
    })

    return () => observer.disconnect()
  }, [sections])

  if (sections.length === 0) return null

  return (
    <nav aria-label="Table of Contents" className="space-y-1">
      <p className="font-label text-xs font-bold uppercase tracking-wider text-on-surface-variant mb-4">
        On this page
      </p>
      {sections.map(section => (
        <a
          key={section.anchor}
          href={`#${section.anchor}`}
          className={cn(
            'block text-sm font-body py-1 px-3 rounded-DEFAULT transition-all duration-200 leading-snug',
            activeAnchor === section.anchor
              ? 'text-primary bg-primary-container/20 font-medium'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container'
          )}
        >
          {section.heading}
        </a>
      ))}
    </nav>
  )
}
