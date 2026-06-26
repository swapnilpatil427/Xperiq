import { NextRequest, NextResponse } from 'next/server'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function encode(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { query } = body

  if (!query || typeof query !== 'string' || query.length > 500) {
    return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      try {
        controller.enqueue(
          encoder.encode(encode({ type: 'reasoning', content: 'Searching knowledge base...' })),
        )

        // Fire doc search and Crystal simultaneously — Crystal runs while docs load.
        const [searchRes, crystalRes] = await Promise.all([
          fetch(`${API_URL}/api/support/docs?q=${encodeURIComponent(query)}`, {
            headers: { 'Content-Type': 'application/json' },
          }),
          fetch(`${API_URL}/api/support/crystal`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query, context_docs: [] }),
            signal: AbortSignal.timeout(12000),
          }),
        ])

        let docs: { key: string; title: string; content: string }[] = []
        if (searchRes.ok) {
          const data = await searchRes.json()
          docs = (data.docs || []).slice(0, 3)
        }

        controller.enqueue(
          encoder.encode(encode({ type: 'reasoning', content: `Found ${docs.length} relevant articles` })),
        )

        try {
          if (crystalRes.ok) {
            controller.enqueue(
              encoder.encode(encode({ type: 'reasoning', content: 'Generating AI-powered answer...' })),
            )
            const crystalData = await crystalRes.json()
            if (crystalData.answer) {
              controller.enqueue(
                encoder.encode(encode({ type: 'answer', content: crystalData.answer })),
              )
            }
          } else if (docs.length > 0) {
            const fallbackAnswer = `Based on our documentation:\n\n${docs.map((d) => `**${d.title}**: ${d.content?.slice(0, 200) || ''}`).join('\n\n')}`
            controller.enqueue(
              encoder.encode(encode({ type: 'answer', content: fallbackAnswer })),
            )
          }
        } catch {
          if (docs.length > 0) {
            const fallbackAnswer = docs
              .map((d) => `**${d.title}**: ${d.content?.slice(0, 200) || ''}`)
              .join('\n\n')
            controller.enqueue(
              encoder.encode(encode({ type: 'answer', content: fallbackAnswer })),
            )
          }
        }

        // Sources
        if (docs.length > 0) {
          controller.enqueue(
            encoder.encode(
              encode({
                type: 'sources',
                sources: docs.map((d) => ({ title: d.title, key: d.key })),
              }),
            ),
          )
        }

        controller.enqueue(encoder.encode(encode({ type: 'done' })))
      } catch {
        controller.enqueue(
          encoder.encode(
            encode({
              type: 'error',
              content: 'Unable to process your question right now.',
            }),
          ),
        )
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
