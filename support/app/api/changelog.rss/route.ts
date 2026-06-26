import { NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://support.experient.ai'

export const dynamic = 'force-dynamic'
export const revalidate = 3600

interface RawChangelogEntry {
  id: string
  version: string
  released_at: string
  summary: string | null
  changes: Array<{ type: string; title: string; description?: string }> | null
  created_at: string
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  let entries: RawChangelogEntry[] = []

  try {
    const res = await fetch(`${API_URL}/api/support/changelog?limit=20`, {
      next: { revalidate: 3600 },
    })
    if (res.ok) {
      const data = await res.json()
      entries = data.entries || []
    }
  } catch {
    // Return empty feed on error
  }

  const items = entries
    .map((entry) => {
      const title = entry.summary?.split('\n')[0]?.slice(0, 120) || `v${entry.version}`
      const changes = entry.changes || []
      const body =
        changes.length > 0
          ? changes
              .map((c) => `${c.title}${c.description ? ': ' + c.description : ''}`)
              .join('\n')
          : entry.summary || ''

      const pubDate = entry.released_at
        ? new Date(entry.released_at).toUTCString()
        : new Date(entry.created_at).toUTCString()

      return `
    <item>
      <title>${escapeXml(`v${entry.version} — ${title}`)}</title>
      <link>${SITE_URL}/changelog</link>
      <guid isPermaLink="false">${escapeXml(`${SITE_URL}/changelog#v${entry.version}`)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${escapeXml(body)}</description>
    </item>`
    })
    .join('')

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Experient Changelog</title>
    <link>${SITE_URL}/changelog</link>
    <description>Product updates, new features, and bug fixes for the Experient platform.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/api/changelog.rss" rel="self" type="application/rss+xml"/>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    <ttl>3600</ttl>${items}
  </channel>
</rss>`

  return new NextResponse(rss, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
    },
  })
}
