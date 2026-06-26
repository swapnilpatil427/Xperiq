import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-revalidate-secret')

  if (secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { doc_key, action } = body

    if (action === 'revalidate_all') {
      revalidatePath('/guides', 'layout')
      revalidatePath('/', 'page')
      return NextResponse.json({ revalidated: true, target: 'all' })
    }

    if (doc_key) {
      revalidatePath(`/guides/${doc_key}`)
      revalidatePath('/guides')
    } else {
      revalidatePath('/guides')
    }

    // Ping IndexNow after revalidation
    const indexNowKey = process.env.INDEXNOW_KEY
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://support.experient.ai'
    if (indexNowKey && doc_key) {
      const url = `${siteUrl}/guides/${doc_key}`
      fetch(`https://api.indexnow.org/indexnow?url=${encodeURIComponent(url)}&key=${indexNowKey}`, {
        method: 'GET',
      }).catch(() => {})
    }

    return NextResponse.json({
      revalidated: true,
      doc_key: doc_key || null,
      timestamp: new Date().toISOString(),
    })
  } catch {
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 })
  }
}
