'use client'
import { useState } from 'react'
import { cn } from '@/lib/cn'

interface CodeBlockProps {
  code: string
  language?: string
  filename?: string
  className?: string
}

export function CodeBlock({ code, language = 'json', filename, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn('rounded-DEFAULT overflow-hidden ghost-border', className)}>
      <div className="flex items-center justify-between px-4 py-2 bg-surface-variant">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-on-surface-variant">{language}</span>
          {filename && <span className="text-xs text-outline">• {filename}</span>}
        </div>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 text-xs text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-[16px]">
            {copied ? 'check' : 'content_copy'}
          </span>
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-6 bg-surface-container overflow-x-auto">
        <code className="font-mono text-sm text-on-surface leading-relaxed">{code}</code>
      </pre>
    </div>
  )
}
