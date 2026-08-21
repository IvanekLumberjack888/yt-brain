import { NextRequest, NextResponse } from 'next/server'
import { getAllKnowledgeItems } from '@/lib/knowledge'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const q = searchParams.get('q')?.toLowerCase().trim() || ''
    const minScore = parseInt(searchParams.get('minScore') || '0', 10)
    const tier = searchParams.get('tier') || 'all'
    const para = searchParams.get('para') || 'all'
    const tag = searchParams.get('tag')?.toLowerCase() || 'all'
    const limit = parseInt(searchParams.get('limit') || '100', 10)

    let items = await getAllKnowledgeItems()

    // Filter by min score
    if (minScore > 0) {
      items = items.filter(item => item.score >= minScore)
    }

    // Filter by tier
    if (tier !== 'all') {
      items = items.filter(item => item.tier.toLowerCase() === tier.toLowerCase())
    }

    // Filter by P.A.R.A.
    if (para !== 'all') {
      items = items.filter(item => item.para.startsWith(para))
    }

    // Filter by tag
    if (tag !== 'all') {
      items = items.filter(item =>
        item.tags.some(t => t.toLowerCase().includes(tag) || tag.includes(t.toLowerCase()))
      )
    }

    // Filter by search query
    if (q) {
      items = items.filter(item => {
        const titleMatch = item.title.toLowerCase().includes(q)
        const channelMatch = item.channel.toLowerCase().includes(q)
        const tldrMatch = item.tldr.toLowerCase().includes(q)
        const pointsMatch = item.keyPoints.some(p => p.toLowerCase().includes(q))
        const actionsMatch = item.actionItems.some(a => a.toLowerCase().includes(q))
        const tagsMatch = item.tags.some(t => t.toLowerCase().includes(q))
        return titleMatch || channelMatch || tldrMatch || pointsMatch || actionsMatch || tagsMatch
      })
    }

    // Compute aggregation stats
    const allTags = new Map<string, number>()
    let tier1Count = 0
    let actionItemCount = 0
    const paraCounts: Record<string, number> = {
      '10_PROJEKTY': 0,
      '20_OBLASTI': 0,
      '30_ZDROJE': 0,
      '40_ARCHIV': 0,
    }

    const allItems = await getAllKnowledgeItems()
    for (const item of allItems) {
      if (item.score >= 8) tier1Count++
      actionItemCount += item.actionItems.length
      for (const t of item.tags) {
        const cleanTag = t.replace(/^#/, '').trim()
        if (cleanTag) {
          allTags.set(cleanTag, (allTags.get(cleanTag) || 0) + 1)
        }
      }
      for (const prefix of ['10_PROJEKTY', '20_OBLASTI', '30_ZDROJE', '40_ARCHIV']) {
        if (item.para.startsWith(prefix)) {
          paraCounts[prefix] = (paraCounts[prefix] || 0) + 1
        }
      }
    }

    const topTags = Array.from(allTags.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name, count]) => ({ name, count }))

    return NextResponse.json({
      items: items.slice(0, limit),
      total: items.length,
      stats: {
        totalKnowledgeRecords: allItems.length,
        tier1HighPriority: tier1Count,
        actionItemsCount: actionItemCount,
        paraCounts,
        topTags,
      },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
