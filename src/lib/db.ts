import { neon } from '@neondatabase/serverless'

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
    recommended_tags?: string[]
  } | null
  tags: string[] | null
  notion_id: string | null
  priority: 'high' | 'medium' | 'low'
  status: 'to_watch' | 'in_progress' | 'done' | 'skip'
  created_at: string
  processed_at: string | null
}

// Initial seed videos for in-memory store when DATABASE_URL is not set or unavailable
const INITIAL_VIDEOS: Video[] = [
  {
    id: 1,
    youtube_url: 'https://youtube.com/watch?v=sBF3UumkL4Y',
    video_id: 'sBF3UumkL4Y',
    title: '9 Claude Code Plugins to Build 10x Faster',
    channel: 'Austin Marchese',
    transcript: 'In this video we are covering 9 powerful plugins for Claude Code that will make you 10x more productive...',
    transcript_lang: 'en',
    summary: 'Video pokrývá 9 Claude Code pluginů designovaných na zvýšení vývojářské produktivity 10x. Přímo relevantní pro growth s Claude ekosystémem.',
    insights: {
      tldr: 'Video pokrývá 9 Claude Code pluginů designovaných na zvýšení vývojářské produktivity 10x v moderním vývoji.',
      key_points: [
        'Claude Code plugins pro automatizaci a akceleraci vývoje',
        'Konkrétní case studies na zvýšení produktivity v IT',
        'Integrace pluginů do existujících workflows',
      ],
      action_items: [
        'Otestovat top 3 pluginy ve vlastním vývojovém prostředí',
        'Zdokumentovat doporučené konfigurace do Second Brain',
      ],
      para_location: '10_PROJEKTY / AI Automation',
      relevance_score: 10,
      recommended_tags: ['productivity', 'mcp', 'llm'],
    },
    tags: ['productivity', 'mcp', 'llm'],
    notion_id: null,
    priority: 'high',
    status: 'to_watch',
    created_at: '2026-08-20T10:00:00Z',
    processed_at: '2026-08-20T10:05:00Z',
  },
  {
    id: 2,
    youtube_url: 'https://youtube.com/watch?v=2f7ZkImNHFo',
    video_id: '2f7ZkImNHFo',
    title: 'Never hit Claudes Usage Limit Again',
    channel: 'Dubibubi',
    transcript: 'Context re-reading is the biggest hidden token drain when working with LLMs...',
    transcript_lang: 'en',
    summary: 'Jak optimalizovat spotřebu tokenů a vyhnout se limitům. 98.5% tokenů jde na relekturu historie, jen 1.5% na odpověď.',
    insights: {
      tldr: 'Video vysvětluje, proč se rychle vyčerpává limit Claude a jak ušetřit 50-65% tokenů pomocí správného členění kontextu.',
      key_points: [
        'Context re-reading je exponenciální, nikoliv lineární růst tokenů',
        'Caveman prompt strategie snižuje tokenový výstup o 65%',
        'Nový chat každých 15-20 zpráv resetuje akumulovaný kontext',
      ],
      action_items: [
        'Zkrátit systémové prompty a využívat batch otázky',
        'Nastavit pravidlo nového chatu po dosažení 20 interakcí',
      ],
      para_location: '30_ZDROJE / LLM Optimizations',
      relevance_score: 9,
      recommended_tags: ['llm', 'productivity', 'career'],
    },
    tags: ['llm', 'productivity'],
    notion_id: null,
    priority: 'high',
    status: 'done',
    created_at: '2026-08-19T08:30:00Z',
    processed_at: '2026-08-19T08:35:00Z',
  },
  {
    id: 3,
    youtube_url: 'https://youtube.com/watch?v=oKpkzVpL6Bg',
    video_id: 'oKpkzVpL6Bg',
    title: 'AZ 700 Day 1: Azure VNets Explained Simply',
    channel: 'The Logic of Success',
    transcript: 'Azure Virtual Networks form the backbone of cloud infrastructure connecting subnets, NSGs, and peering...',
    transcript_lang: 'en',
    summary: 'Základy síťové infrastruktury v Azure: podsítě, Network Security Groups, VNet peering a bezpečné propojení.',
    insights: {
      tldr: 'Přehledné vysvětlení Azure VNet konceptů a sítění pro cloudové a datové inženýry.',
      key_points: [
        'Azure VNet fundamentals (subnet, NSG, peering)',
        'Zabezpečení přenosu dat mezi Data Factory a privátními clustery',
        'Příprava na certifikaci a praktické využití v cloudu',
      ],
      action_items: [
        'Zopakovat pravidla routování a firewallu v Azure VNet',
        'Vytvořit referenční diagram propojení v Notion',
      ],
      para_location: '20_OBLASTI / Azure Cloud',
      relevance_score: 9,
      recommended_tags: ['azure', 'sql', 'career'],
    },
    tags: ['azure', 'career'],
    notion_id: null,
    priority: 'high',
    status: 'in_progress',
    created_at: '2026-08-18T14:15:00Z',
    processed_at: '2026-08-18T14:20:00Z',
  },
  {
    id: 4,
    youtube_url: 'https://youtube.com/watch?v=OFj62u2vZm4',
    video_id: 'OFj62u2vZm4',
    title: 'Fine Tuning LLMs Explained | LoRA, QLoRA & Domain-Specific AI Models',
    channel: 'AI Hints',
    transcript: 'Fine-tuning with Low-Rank Adaptation (LoRA) and quantized LoRA allows training custom models on consumer hardware...',
    transcript_lang: 'en',
    summary: 'Metody fine-tuningu modelů pomocí LoRA a QLoRA s minimálními výpočetními nároky.',
    insights: {
      tldr: 'Praktický průvodce jemným laděním jazykových modelů pro specifické domény bez nutnosti trénovat od nuly.',
      key_points: [
        'LoRA snižuje počet trénovatelných parametrů o více než 99%',
        'QLoRA umožňuje kvantizaci do 4-bitů pro úsporu VRAM',
        'Ideální pro firemní doménové znalostní báze',
      ],
      action_items: [
        'Prozkoumat HuggingFace PEFT knihovnu pro experimenty',
      ],
      para_location: '30_ZDROJE / Machine Learning',
      relevance_score: 8,
      recommended_tags: ['python', 'llm', 'databricks'],
    },
    tags: ['python', 'llm', 'databricks'],
    notion_id: null,
    priority: 'medium',
    status: 'to_watch',
    created_at: '2026-08-17T11:00:00Z',
    processed_at: '2026-08-17T11:05:00Z',
  },
  {
    id: 5,
    youtube_url: 'https://youtube.com/watch?v=S7sJA51CxIo',
    video_id: 'S7sJA51CxIo',
    title: 'This Kubernetes Homelab Setup is My Favorite One Yet',
    channel: 'Mischa van den Burg',
    transcript: 'Setting up a local k8s cluster using lightweight nodes and GitOps for continuous delivery...',
    transcript_lang: 'en',
    summary: 'Hands-on ukázka konfigurace Kubernetes homelabu pro praktické testování mikroslužeb a kontejnerizace.',
    insights: {
      tldr: 'Architektura efektivního lokálního Kubernetes homelabu pro praktické procvičování orchestrace.',
      key_points: [
        'K3s / lightweight k8s konfigurace pro rychlý rozběh',
        'GitOps workflow pro automatickou synchronizaci manifestů',
        'Monitorování clusteru pomocí Prometheus & Grafana',
      ],
      action_items: [
        'Vyzkoušet nasazení jednoduché kontejnerizované aplikace lokálně',
      ],
      para_location: '20_OBLASTI / DevOps',
      relevance_score: 7,
      recommended_tags: ['productivity', 'career'],
    },
    tags: ['productivity', 'career'],
    notion_id: null,
    priority: 'medium',
    status: 'to_watch',
    created_at: '2026-08-16T09:20:00Z',
    processed_at: '2026-08-16T09:25:00Z',
  },
]

// In-memory store
class MemoryDatabase {
  private videos: Video[] = [...INITIAL_VIDEOS]
  private nextId = INITIAL_VIDEOS.length + 1

  async query(queryStr: string, params: any[]): Promise<any[]> {
    const q = queryStr.trim()

    // 1. SELECT by status
    if (q.includes('FROM videos WHERE status =') || (q.includes('WHERE status =') && q.includes('ORDER BY'))) {
      const statusParam = params[0]
      return this.videos
        .filter(v => v.status === statusParam)
        .sort((a, b) => {
          const pOrder = { high: 1, medium: 2, low: 3 }
          const pDiff = (pOrder[a.priority] || 3) - (pOrder[b.priority] || 3)
          if (pDiff !== 0) return pDiff
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
    }

    // 2. SELECT by priority
    if (q.includes('FROM videos WHERE priority =') || (q.includes('WHERE priority =') && q.includes('ORDER BY'))) {
      const priorityParam = params[0]
      return this.videos
        .filter(v => v.priority === priorityParam)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    // 3. SELECT by video_id
    if (q.includes('FROM videos WHERE video_id =')) {
      const videoIdParam = params[0]
      const found = this.videos.filter(v => v.video_id === videoIdParam)
      return found.slice(0, 1)
    }

    // 4. SELECT by id
    if (q.includes('FROM videos WHERE id =')) {
      const idParam = Number(params[0])
      const found = this.videos.filter(v => v.id === idParam)
      return found.slice(0, 1)
    }

    // 5. General SELECT all
    if (q.includes('SELECT') && q.includes('FROM videos') && !q.includes('WHERE')) {
      return [...this.videos].sort((a, b) => {
        const pOrder = { high: 1, medium: 2, low: 3 }
        const pDiff = (pOrder[a.priority] || 3) - (pOrder[b.priority] || 3)
        if (pDiff !== 0) return pDiff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    }

    // 6. UPDATE videos SET status = ..., priority = ... WHERE id = ...
    if (q.includes('UPDATE videos SET status =') && q.includes('priority =')) {
      const statusParam = params[0]
      const priorityParam = params[1]
      const idParam = Number(params[2])
      const index = this.videos.findIndex(v => v.id === idParam)
      if (index !== -1) {
        if (statusParam) this.videos[index].status = statusParam
        if (priorityParam) this.videos[index].priority = priorityParam
      }
      return []
    }

    // 7. UPDATE videos SET summary = ..., insights = ..., tags = ... WHERE id = ...
    if (q.includes('UPDATE videos SET summary =')) {
      const summaryParam = params[0]
      const insightsParam = typeof params[1] === 'string' ? JSON.parse(params[1]) : params[1]
      const tagsParam = params[2]
      const idParam = Number(params[3])
      const index = this.videos.findIndex(v => v.id === idParam)
      if (index !== -1) {
        this.videos[index].summary = summaryParam
        this.videos[index].insights = insightsParam
        this.videos[index].tags = tagsParam
        this.videos[index].processed_at = new Date().toISOString()
      }
      return []
    }

    // 8. UPDATE videos SET title = ..., channel = ... WHERE video_id = ...
    if (q.includes('UPDATE videos') && q.includes('SET title =') && q.includes('WHERE video_id =')) {
      const titleParam = params[0]
      const channelParam = params[1]
      const videoIdParam = params[2]
      const index = this.videos.findIndex(v => v.video_id === videoIdParam)
      if (index !== -1) {
        if (titleParam) this.videos[index].title = titleParam
        if (channelParam) this.videos[index].channel = channelParam
      }
      return []
    }

    // 9. INSERT INTO videos ... RETURNING ...
    if (q.includes('INSERT INTO videos')) {
      const youtubeUrl = params[0]
      const videoId = params[1]
      const title = params[2]
      const channel = params[3]
      const transcript = params[4]
      const lang = params[5] || 'en'

      const newVideo: Video = {
        id: this.nextId++,
        youtube_url: youtubeUrl,
        video_id: videoId,
        title: title || null,
        channel: channel || null,
        transcript: transcript || null,
        transcript_lang: lang,
        summary: null,
        insights: null,
        tags: null,
        notion_id: null,
        priority: 'medium',
        status: 'to_watch',
        created_at: new Date().toISOString(),
        processed_at: null,
      }
      this.videos.unshift(newVideo)
      return [newVideo]
    }

    // 10. DELETE FROM videos WHERE id = ...
    if (q.includes('DELETE FROM videos WHERE id =')) {
      const idParam = Number(params[0])
      this.videos = this.videos.filter(v => v.id !== idParam)
      return []
    }

    // 11. DELETE FROM videos WHERE id IN or ANY
    if (q.includes('DELETE FROM videos WHERE id = ANY') || q.includes('DELETE FROM videos WHERE id IN')) {
      const idsParam = Array.isArray(params[0]) ? params[0].map(Number) : [Number(params[0])]
      const idSet = new Set(idsParam)
      this.videos = this.videos.filter(v => !idSet.has(v.id))
      return []
    }

    // 12. UPDATE videos SET status = ... WHERE id = ANY
    if (q.includes('UPDATE videos SET status =') && (q.includes('WHERE id = ANY') || q.includes('WHERE id IN'))) {
      const statusParam = params[0]
      const idsParam = Array.isArray(params[1]) ? params[1].map(Number) : [Number(params[1])]
      const idSet = new Set(idsParam)
      for (const video of this.videos) {
        if (idSet.has(video.id) && statusParam) {
          video.status = statusParam
        }
      }
      return []
    }

    return []
  }
}

const memoryDb = new MemoryDatabase()

let neonClient: any = null
let neonFailed = false

// Tagged template sql function that delegates to Neon or memoryDb fallback
export const sql: any = async (strings: TemplateStringsArray, ...values: any[]) => {
  const databaseUrl = process.env.DATABASE_URL
  const isConfigured = Boolean(
    databaseUrl &&
    !databaseUrl.includes('placeholder') &&
    !databaseUrl.includes('example.com') &&
    databaseUrl.startsWith('postgres')
  )

  if (isConfigured && !neonFailed) {
    try {
      if (!neonClient && databaseUrl) {
        neonClient = neon(databaseUrl)
      }
      return await neonClient(strings, ...values)
    } catch {
      neonFailed = true
    }
  }

  // Construct query string with parameter markers
  let fullQuery = strings[0]
  for (let i = 0; i < values.length; i++) {
    fullQuery += `$${i + 1}` + strings[i + 1]
  }

  return await memoryDb.query(fullQuery, values)
}
