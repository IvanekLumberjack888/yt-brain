import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { extractVideoId, fetchTranscript, fetchVideoMetadata } from '@/lib/youtube'

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json()
    if (!url) return NextResponse.json({ error: 'URL is required' }, { status: 400 })

    const videoId = extractVideoId(url)
    if (!videoId) return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 })

    const youtubeUrl = `https://www.youtube.com/watch?v=${videoId}`

    // Existuje v DB?
    const existing = await sql`
      SELECT id, video_id, title, channel, transcript, summary, insights, tags, priority, status, created_at, processed_at
      FROM videos WHERE video_id = ${videoId} LIMIT 1
    `

    if (existing.length > 0) {
      const row = existing[0]
      if (!row.title || !row.channel) {
        const meta = await fetchVideoMetadata(videoId)
        if (meta?.title || meta?.channel) {
          await sql`
            UPDATE videos
            SET title = COALESCE(${meta?.title ?? null}, title),
                channel = COALESCE(${meta?.channel ?? null}, channel)
            WHERE video_id = ${videoId}
          `
          row.title = meta?.title ?? row.title
          row.channel = meta?.channel ?? row.channel
        }
      }
      return NextResponse.json({ video: row, cached: true })
    }

    const meta = await fetchVideoMetadata(videoId)
    console.log('[transcript] metadata:', meta)

    let transcript: string | null = null
    let lang: string | null = null
    let transcriptWarning: string | null = null

    try {
      const result = await fetchTranscript(videoId)
      transcript = result.transcript || null
      lang = result.lang || null
      console.log('[transcript] success, length:', transcript?.length)
    } catch (err) {
      transcriptWarning = err instanceof Error ? err.message : 'Transcript unavailable'
      console.error('[transcript] FAILED:', transcriptWarning)
    }

    const inserted = await sql`
      INSERT INTO videos (youtube_url, video_id, title, channel, transcript, transcript_lang)
      VALUES (
        ${youtubeUrl},
        ${videoId},
        ${meta?.title ?? null},
        ${meta?.channel ?? null},
        ${transcript},
        ${lang}
      )
      RETURNING id, video_id, title, channel, transcript, summary, insights, tags, priority, status, created_at, processed_at
    `

    return NextResponse.json({
      video: inserted[0],
      cached: false,
      ...(transcriptWarning ? { warning: transcriptWarning } : {})\
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[transcript] route error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
