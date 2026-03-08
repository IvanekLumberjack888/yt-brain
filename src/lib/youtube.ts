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

export async function fetchTranscript(videoId: string): Promise<{ transcript: string; lang: string }> {
  // Method 1: Try timedtext API directly
  try {
    const result = await fetchViaTimedText(videoId)
    if (result) return result
  } catch { /* continue */ }

  // Method 2: Try youtube-transcript package
  try {
    const { YoutubeTranscript } = await import('youtube-transcript')
    const data = await YoutubeTranscript.fetchTranscript(videoId)
    const transcript = data.map((i: { text: string }) => i.text.replace(/\n/g, ' ').trim()).filter(Boolean).join(' ')
    if (transcript.length > 100) return { transcript, lang: 'en' }
  } catch { /* continue */ }

  throw new Error(`No transcript available for video ${videoId}. The video may not have captions enabled.`)
}

async function fetchViaTimedText(videoId: string): Promise<{ transcript: string; lang: string } | null> {
  // Fetch the video page to get caption track URLs
  const pageRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })

  if (!pageRes.ok) return null
  const html = await pageRes.text()

  // Extract captions data from ytInitialPlayerResponse
  const captionsMatch = html.match(/"captions":(\{.*?\}),"videoDetails"/s)
  if (!captionsMatch) return null

  let captionsJson
  try {
    captionsJson = JSON.parse(captionsMatch[1])
  } catch { return null }

  const tracks = captionsJson?.playerCaptionsTracklistRenderer?.captionTracks
  if (!tracks || tracks.length === 0) return null

  // Prefer English, fallback to first available
  const track = tracks.find((t: { languageCode: string }) => t.languageCode === 'en') || tracks[0]
  const lang = track.languageCode || 'auto'

  // Fetch the transcript XML
  const transcriptRes = await fetch(track.baseUrl + '&fmt=json3')
  if (!transcriptRes.ok) return null

  const transcriptData = await transcriptRes.json()
  const events = transcriptData?.events || []
  
  const transcript = events
    .filter((e: { segs?: { utf8: string }[] }) => e.segs)
    .map((e: { segs: { utf8: string }[] }) =>
      e.segs.map((s) => s.utf8).join('').replace(/\n/g, ' ').trim()
    )
    .filter(Boolean)
    .join(' ')

  if (transcript.length < 50) return null
  return { transcript, lang }
}

export async function fetchVideoMetadata(videoId: string): Promise<{ title: string; channel: string } | null> {
  try {
    const res = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
    )
    if (!res.ok) return null
    const data = await res.json()
    return { title: data.title ?? '', channel: data.author_name ?? '' }
  } catch { return null }
}
