import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')
    const priority = searchParams.get('priority')
    let videos
    if (status) {
      videos = await sql`SELECT id, video_id, title, channel, summary, insights, tags, priority, status, created_at, processed_at FROM videos WHERE status = ${status} ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC`
    } else if (priority) {
      videos = await sql`SELECT id, video_id, title, channel, summary, insights, tags, priority, status, created_at, processed_at FROM videos WHERE priority = ${priority} ORDER BY created_at DESC`
    } else {
      videos = await sql`SELECT id, video_id, title, channel, summary, insights, tags, priority, status, created_at, processed_at FROM videos ORDER BY CASE priority WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, created_at DESC LIMIT 100`
    }
    return NextResponse.json({ videos })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, priority } = await req.json()
    if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
    await sql`UPDATE videos SET status = COALESCE(${status ?? null}, status), priority = COALESCE(${priority ?? null}, priority) WHERE id = ${id}`
    return NextResponse.json({ ok: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
