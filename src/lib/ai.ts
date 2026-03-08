export type SummaryResult = {
  tldr: string
  key_points: string[]
  action_items: string[]
  para_location: string
  relevance_score: number
  recommended_tags: string[]
}

const AVAILABLE_TAGS = ['azure', 'python', 'fabric', 'adhd', 'productivity', 'mcp', 'llm', 'investing', 'personal', 'sql', 'git', 'career', 'databricks']

export async function summarizeTranscript(transcript: string, title: string, channel: string): Promise<SummaryResult> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set')

  const maxChars = 48000
  const truncated = transcript.length > maxChars ? transcript.slice(0, maxChars) + '\n\n[transcript truncated]' : transcript

  const prompt = `Analyze this YouTube video transcript for a Junior Data Engineer at Konica Minolta (Azure stack: ADF, Databricks, Event Hub, Service Bus). He is transitioning from non-IT to IT, learning AI/Data Engineering, uses Notion P.A.R.A. system.\n\nVideo: "${title}" by ${channel}\n\nTRANSCRIPT:\n${truncated}\n\nRespond ONLY with valid JSON (no markdown):\n{\n  "tldr": "2-3 sentence summary in Czech",\n  "key_points": ["3-5 key insights in Czech"],\n  "action_items": ["1-3 concrete next steps in Czech"],\n  "para_location": "10_PROJEKTY / 20_OBLASTI / 30_ZDROJE — with brief reason in Czech",\n  "relevance_score": 1-10,\n  "recommended_tags": ["1-3 from: ${AVAILABLE_TAGS.join(', ')}"]
}`

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  })

  if (!response.ok) { const err = await response.text(); throw new Error(`Anthropic API error: ${response.status} — ${err}`) }

  const data = await response.json()
  const text = data.content?.[0]?.text ?? ''
  try { return JSON.parse(text) as SummaryResult }
  catch { throw new Error(`Failed to parse AI response: ${text.slice(0, 200)}`) }
}
