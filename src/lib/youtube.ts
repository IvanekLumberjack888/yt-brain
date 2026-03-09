export function extractVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ]
  for (const pattern of patterns) {
    const match = url.match(pattern)
    if (match) return match[1]
  }
  return null
}

// Fetch transcript via YouTube Data API v3 (captions.list + download)
export async function fetchTranscript(videoId: string): Promise<{ transcript: string; lang: string }> {
  const apiKey = process.env.YOUTUBE_API_KEY
  if (!apiKey) throw new Error('YOUTUBE_API_KEY not set')

  // Step 1: Get list of caption tracks
  const listRes = await fetch(
    `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`
  )
  if (!listRes.ok) {
    const err = await listRes.json().catch(() => ({}))
    throw new Error(`YouTube API error: ${err?.error?.message ?? listRes.status}`)
  }

  const listData = await listRes.json()
  const items: { id: string; snippet: { language: string; trackKind: string } }[] = listData.items ?? []

  if (items.length === 0) {
    throw new Error(`No captions available for video ${videoId}`)
  }

  // Prefer: manual English > auto English > any manual > first available
  const pick =
    items.find(i => i.snippet.language === 'en' && i.snippet.trackKind !== 'asr') ||
    items.find(i => i.snippet.language === 'en') ||
    items.find(i => i.snippet.trackKind !== 'asr') ||
    items[0]

  const lang = pick.snippet.language

  // Step 2: Download caption track as plain text (tldr format)
  // Note: OAuth required for private videos — for public videos use tfmt=srt or vtt via timedtext
  // YouTube Data API v3 captions.download requires OAuth, so we fall back to timedtext with track info
  const transcriptResult = await fetchViaTimedTextApi(videoId, lang)
  if (transcriptResult) return transcriptResult

  // Fallback: try youtube-transcript npm package
  try {
    const { YoutubeTranscript } = await import('youtube-transcript')
    const data = await YoutubeTranscript.fetchTranscript(videoId, { lang })
    const transcript = data
      .map((i: { text: string }) => i.text.replace(/\n/g, ' ').trim())
      .filter(Boolean)
      .join(' ')
    if (transcript.length > 100) return { transcript, lang }
  } catch { /* continue */ }

  throw new Error(`Transcript download failed for video ${videoId}`)
}

// Use YouTube timedtext endpoint (works for public videos without OAuth)
async function fetchViaTimedTextApi(
  videoId: string,
  lang: string
): Promise<{ transcript: string; lang: string } | null> {
  // Try multiple lang variants
  const langs = [lang, 'en', 'en-US', 'en-GB']
  
  for (const l of langs) {
    try {
      const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${l}&fmt=json3`
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; YTBrain/1.0)',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      })
      if (!res.ok) continue

      const data = await res.json().catch(() => null)
      if (!data?.events) continue

      const transcript = (data.events as { segs?: { utf8: string }[] }[])
        .filter(e => e.segs)
        .map(e => e.segs!.map(s => s.utf8).join('').replace(/\n/g, ' ').trim())
        .filter(Boolean)
        .join(' ')

      if (transcript.length > 100) return { transcript, lang: l }
    } catch { continue }
  }
  return null
}

export async function fetchVideoMetadata(videoId: string): Promise<{ title: string; channel: string } | null> {
  // Try YouTube Data API v3 first (more reliable)
  const apiKey = process.env.YOUTUBE_API_KEY
  if (apiKey) {
    try {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`
      )
      if (res.ok) {
        const data = await res.json()
        const item = data.items?.[0]?.snippet
        if (item) return { title: item.title ?? '', channel: item.channelTitle ?? '' }
      }
    } catch { /* fallback */ }
  }

  // Fallback: oEmbed (no API key needed)
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    )
    if (!res.ok) return null
    const data = await res.json()
    return { title: data.title ?? '', channel: data.author_name ?? '' }
  } catch { return null }
}
