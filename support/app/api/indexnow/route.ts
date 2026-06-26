import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.REVALIDATE_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const indexNowKey = process.env.INDEXNOW_KEY
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://support.experient.ai'

  if (!indexNowKey) {
    return NextResponse.json({ error: 'IndexNow key not configured' }, { status: 500 })
  }

  const urlsToIndex = [
    siteUrl,
    `${siteUrl}/guides`,
    `${siteUrl}/roadmap`,
    `${siteUrl}/changelog`,
    `${siteUrl}/status`,
  ]

  const body = {
    host: new URL(siteUrl).hostname,
    key: indexNowKey,
    keyLocation: `${siteUrl}/${indexNowKey}.txt`,
    urlList: urlsToIndex,
  }

  try {
    const [googleRes, bingRes] = await Promise.allSettled([
      fetch('https://api.indexnow.org/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
      fetch('https://www.bing.com/indexnow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }),
    ])

    return NextResponse.json({
      submitted: true,
      urls: urlsToIndex.length,
      google: googleRes.status === 'fulfilled' ? googleRes.value.status : 'error',
      bing: bingRes.status === 'fulfilled' ? bingRes.value.status : 'error',
    })
  } catch {
    return NextResponse.json({ error: 'IndexNow submission failed' }, { status: 500 })
  }
}
