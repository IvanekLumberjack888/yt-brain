import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { summarizeTranscript } from '@/lib/ai'

export async function POST(req: NextRequest) {
  try {
    const { videoId } = await req.json()
    if (!videoId) return NextResponse.json({ error: 'videoId is required' }, { status: 400 })
    const rows = await sql`SELECT id, video_id, title, channel, transcript, summary, insights FROM videos WHERE id = ${videoId} LIMIT 1`
    if (rows.length === 0) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    const video = rows[0]
    if (video.summary) return NextResponse.json({ summary: video.summary, insights: video.insights, cached: true })
    if (!video.transcript) return NextResponse.json({ error: 'No transcript available' }, { status: 400 })
    const insights = await summarizeTranscript(video.transcript, video.title ?? 'Unknown', video.channel ?? 'Unknown')
    await sql`UPDATE videos SET summary = ${insights.tldr}, insights = ${JSON.stringify(insights)}, tags = ${insights.recommended_tags}, processed_at = NOW() WHERE id = ${videoId}`
    return NextResponse.json({ insights, cached: false })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
