import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL
if (!databaseUrl) {
  throw new Error('DATABASE_URL environment variable is not set')
}

export const sql = neon(databaseUrl)

export type Video = {
  id: number
  youtube_url: string
  video_id: string
  title: string | null
  channel: string | null
  transcript: string | null
  transcript_lang: string
  summary: string | null
  insights: {
    tldr?: string
    key_points?: string[]
    action_items?: string[]
    para_location?: string
    relevance_score?: number
  } | null
  tags: string[] | null
  notion_id: string | null
  priority: 'high' | 'medium' | 'low'
  status: 'to_watch' | 'in_progress' | 'done' | 'skip'
  created_at: string
  processed_at: string | null
}
