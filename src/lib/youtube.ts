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

type TranscriptItem = { text: string; offset: number; duration: number }

export async function fetchTranscript(videoId: string): Promise<{ transcript: string; lang: string }> {
  const { YoutubeTranscript } = await import('youtube-transcript')
  let transcriptData: TranscriptItem[]
  let lang = 'en'
  try {
    transcriptData = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' })
  } catch {
    try {
      transcriptData = await YoutubeTranscript.fetchTranscript(videoId)
      lang = 'auto'
    } catch {
      throw new Error(`No transcript available for video ${videoId}. Video may be private or have captions disabled.`)
    }
  }
  const transcript = transcriptData.map((item: TranscriptItem) => item.text.replace(/\n/g, ' ').trim()).filter(Boolean).join(' ')
  return { transcript, lang }
}

export async function fetchVideoMetadata(videoId: string): Promise<{ title: string; channel: string } | null> {
  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`, { next: { revalidate: 86400 } })
    if (!res.ok) return null
    const data = await res.json()
    return { title: data.title ?? '', channel: data.author_name ?? '' }
  } catch { return null }
}
