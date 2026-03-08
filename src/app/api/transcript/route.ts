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
    const existing = await sql`SELECT id, video_id, title, channel, transcript, summary, insights, tags, priority, status, created_at, processed_at FROM videos WHERE video_id = ${videoId} LIMIT 1`
    if (existing.length > 0) return NextResponse.json({ video: existing[0], cached: true })
    const meta = await fetchVideoMetadata(videoId)
    const { transcript, lang } = await fetchTranscript(videoId)
    const inserted = await sql`INSERT INTO videos (youtube_url, video_id, title, channel, transcript, transcript_lang) VALUES (${youtubeUrl}, ${videoId}, ${meta?.title ?? null}, ${meta?.channel ?? null}, ${transcript}, ${lang}) RETURNING id, video_id, title, channel, transcript, summary, insights, tags, priority, status, created_at, processed_at`
    return NextResponse.json({ video: inserted[0], cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
