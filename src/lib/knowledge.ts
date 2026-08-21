import fs from 'fs'
import path from 'path'
import { sql, Video } from './db'

export type KnowledgeItem = {
  id: string | number
  videoId: string
  title: string
  channel: string
  sourceUrl: string
  date: string
  score: number
  tier: 'HIGH' | 'MEDIUM' | 'LOW'
  category: string
  para: string
  tags: string[]
  tldr: string
  keyPoints: string[]
  actionItems: string[]
  rawContent?: string
}

let cachedKnowledge: KnowledgeItem[] | null = null
let cacheTimestamp = 0

export async function getAllKnowledgeItems(): Promise<KnowledgeItem[]> {
  const now = Date.now()
  if (cachedKnowledge && now - cacheTimestamp < 30000) {
    return cachedKnowledge
  }

  const itemsMap = new Map<string, KnowledgeItem>()

  // 1. Load from DB videos
  try {
    const dbVideos: Video[] = await sql`SELECT * FROM videos ORDER BY created_at DESC`
    for (const v of dbVideos) {
      if (!v.video_id) continue
      const isHigh = v.priority === 'high' || (v.insights?.relevance_score ?? 0) >= 8
      const isMed = v.priority === 'medium' || (v.insights?.relevance_score ?? 0) >= 5
      itemsMap.set(v.video_id, {
        id: v.id,
        videoId: v.video_id,
        title: v.title || 'Bez názvu',
        channel: v.channel || 'Neznámý kanál',
        sourceUrl: v.youtube_url || `https://youtube.com/watch?v=${v.video_id}`,
        date: v.created_at ? v.created_at.slice(0, 10) : '2026-08-20',
        score: v.insights?.relevance_score ?? (isHigh ? 9 : isMed ? 6 : 3),
        tier: isHigh ? 'HIGH' : isMed ? 'MEDIUM' : 'LOW',
        category: v.insights?.para_location?.split('/')[1]?.trim() || 'AI / Engineering',
        para: v.insights?.para_location || (isHigh ? '10_PROJEKTY / AI Automation' : '30_ZDROJE / IT Reference'),
        tags: v.tags || v.insights?.recommended_tags || ['llm', 'productivity'],
        tldr: v.insights?.tldr || v.summary || 'Zpracované video bez detailního popisu.',
        keyPoints: v.insights?.key_points || (v.summary ? [v.summary] : []),
        actionItems: v.insights?.action_items || [],
      })
    }
  } catch (err) {
    console.warn('[Knowledge] Could not query DB videos:', err)
  }

  // 2. Parse from /public/briefs/ (e.g. 2026-06-20.json, 2026-06-21.json, etc.)
  try {
    const briefsDir = path.join(process.cwd(), 'public', 'briefs')
    if (fs.existsSync(briefsDir)) {
      const files = fs.readdirSync(briefsDir)
      for (const file of files) {
        if (!file.endsWith('.json') || file === 'index.json' || file === 'latest.json') continue
        try {
          const content = fs.readFileSync(path.join(briefsDir, file), 'utf-8')
          const briefData = JSON.parse(content)
          const date = briefData.date || file.replace('.json', '')

          const parseList = (list: any[], tier: 'HIGH' | 'MEDIUM' | 'LOW') => {
            if (!Array.isArray(list)) return
            for (const item of list) {
              if (!item.url && !item.title) continue
              const videoIdMatch = item.url ? item.url.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/) : null
              const videoId = videoIdMatch ? videoIdMatch[1] : item.url || item.title
              
              const rawTags: string[] = []
              if (Array.isArray(item.tags)) {
                rawTags.push(...item.tags)
              } else if (typeof item.tags === 'string') {
                rawTags.push(...item.tags.split(/[,\s#]+/).filter(Boolean))
              }

              const existing = itemsMap.get(videoId)
              const score = item.score || (tier === 'HIGH' ? 9 : tier === 'MEDIUM' ? 6 : 3)

              if (!existing || (item.key_points && item.key_points.length > (existing.keyPoints?.length || 0))) {
                itemsMap.set(videoId, {
                  id: videoId,
                  videoId: videoId.length === 11 ? videoId : '',
                  title: item.title || existing?.title || 'Znalostní položka',
                  channel: item.channel || existing?.channel || 'YouTube',
                  sourceUrl: item.url || (videoId.length === 11 ? `https://youtube.com/watch?v=${videoId}` : ''),
                  date,
                  score,
                  tier,
                  category: item.category || existing?.category || (score >= 8 ? 'AI / WORK' : 'RESOURCES'),
                  para: score >= 8 ? '10_PROJEKTY / AI Automation' : score >= 6 ? '20_OBLASTI / Data Engineering' : '30_ZDROJE / Reference',
                  tags: rawTags.length > 0 ? rawTags : (existing?.tags || ['ai', 'productivity']),
                  tldr: item.summary || existing?.tldr || '',
                  keyPoints: item.key_points || existing?.keyPoints || (item.summary ? [item.summary] : []),
                  actionItems: item.action ? [item.action] : (existing?.actionItems || []),
                })
              }
            }
          }

          parseList(briefData.high, 'HIGH')
          parseList(briefData.medium, 'MEDIUM')
          parseList(briefData.low, 'LOW')
        } catch {
          // ignore single file parse error
        }
      }
    }
  } catch (err) {
    console.warn('[Knowledge] Could not parse briefs:', err)
  }

  // 3. Parse Markdown summaries in /summaries/
  try {
    const summariesDir = path.join(process.cwd(), 'summaries')
    if (fs.existsSync(summariesDir)) {
      const files = fs.readdirSync(summariesDir)
      for (const file of files) {
        if (!file.endsWith('.md')) continue
        try {
          const content = fs.readFileSync(path.join(summariesDir, file), 'utf-8')
          
          // Simple frontmatter extractor
          const titleMatch = content.match(/title:\s*"([^"]+)"/) || content.match(/^#\s+(.+)$/m)
          const channelMatch = content.match(/channel:\s*"([^"]+)"/) || content.match(/\[([^\]]+)\]\(https:\/\/youtube/)
          const sourceMatch = content.match(/source:\s*"([^"]+)"/) || content.match(/https:\/\/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/)
          const scoreMatch = content.match(/score:\s*(\d+)/) || content.match(/Score:\s*(\d+)\/10/)
          const triageMatch = content.match(/triage:\s*"([^"]+)"/)
          
          const title = titleMatch ? titleMatch[1] : file.replace('.md', '')
          const channel = channelMatch ? channelMatch[1] : 'YouTube'
          const sourceUrl = sourceMatch ? (sourceMatch[1].startsWith('http') ? sourceMatch[1] : `https://youtube.com/watch?v=${sourceMatch[1]}`) : ''
          const videoIdMatch = sourceUrl.match(/(?:v=|youtu\.be\/|embed\/)([a-zA-Z0-9_-]{11})/)
          const videoId = videoIdMatch ? videoIdMatch[1] : file.replace('.md', '')
          const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 7
          const tier = triageMatch?.includes('HIGH') || score >= 8 ? 'HIGH' : score >= 5 ? 'MEDIUM' : 'LOW'
          
          // Extract Key points from markdown
          const keyPoints: string[] = []
          const lines = content.split('\n')
          let inPoints = false
          for (const line of lines) {
            if (line.includes('## Klíčové body') || line.includes('## Key Insights')) {
              inPoints = true
              continue
            }
            if (inPoints && line.startsWith('## ')) {
              inPoints = false
            }
            if (inPoints && line.trim().startsWith('-')) {
              const pt = line.replace(/^-\s*/, '').trim()
              if (pt && !pt.includes('(viz video)')) keyPoints.push(pt)
            }
          }

          if (!itemsMap.has(videoId) || (itemsMap.get(videoId)?.keyPoints.length || 0) < keyPoints.length) {
            itemsMap.set(videoId, {
              id: videoId,
              videoId: videoId.length === 11 ? videoId : '',
              title,
              channel,
              sourceUrl,
              date: file.slice(0, 10),
              score,
              tier,
              category: score >= 8 ? 'AI / WORK' : 'DATA / CLOUD',
              para: score >= 8 ? '10_PROJEKTY / AI Automation' : '30_ZDROJE / Reference',
              tags: ['claude', 'productivity', 'engineering'],
              tldr: title,
              keyPoints: keyPoints.length > 0 ? keyPoints : [title],
              actionItems: [],
              rawContent: content,
            })
          }
        } catch {
          // ignore
        }
      }
    }
  } catch (err) {
    console.warn('[Knowledge] Could not parse summaries folder:', err)
  }

  const result = Array.from(itemsMap.values()).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })

  cachedKnowledge = result
  cacheTimestamp = Date.now()
  return result
}
