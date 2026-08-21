import { GoogleGenAI } from '@google/genai'

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
  const maxChars = 48000
  const truncated = transcript.length > maxChars ? transcript.slice(0, maxChars) + '\n\n[transcript truncated]' : transcript

  const prompt = `Analyze this YouTube video transcript for a Junior Data Engineer at Konica Minolta (Azure stack: ADF, Databricks, Event Hub, Service Bus). He is transitioning from non-IT to IT, learning AI/Data Engineering, uses Notion P.A.R.A. system.

Video: "${title}" by ${channel}

TRANSCRIPT:
${truncated}

Respond ONLY with valid JSON (no markdown block, raw JSON object):
{
  "tldr": "2-3 sentence summary in Czech",
  "key_points": ["3-5 key insights in Czech"],
  "action_items": ["1-3 concrete next steps in Czech"],
  "para_location": "10_PROJEKTY / 20_OBLASTI / 30_ZDROJE — with brief reason in Czech",
  "relevance_score": 1-10,
  "recommended_tags": ["1-3 from: ${AVAILABLE_TAGS.join(', ')}"]
}`

  // 1. Try Gemini API if GEMINI_API_KEY is available
  if (process.env.GEMINI_API_KEY) {
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
      const res = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      })
      const text = res.text?.trim() ?? ''
      const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(cleaned) as SummaryResult
      if (parsed.tldr && parsed.key_points) {
        return parsed
      }
    } catch (geminiErr) {
      console.warn('[AI] Gemini API error, checking alternatives:', geminiErr)
    }
  }

  // 2. Try Anthropic API if ANTHROPIC_API_KEY is available
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 1024,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (response.ok) {
        const data = await response.json()
        const text = data.content?.[0]?.text ?? ''
        const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        return JSON.parse(cleaned) as SummaryResult
      }
    } catch (anthropicErr) {
      console.warn('[AI] Anthropic API error:', anthropicErr)
    }
  }

  // 3. Fallback mock summary if no API keys configured or offline
  const sampleSentences = truncated
    .split(/(?<=[.?!])\s+/)
    .filter(s => s.trim().length > 20)
    .slice(0, 4)
    .join(' ')

  return {
    tldr: sampleSentences ? `Shrnutí videa "${title}": ${sampleSentences.slice(0, 280)}...` : `Shrnutí k videu ${title} od autora ${channel}.`,
    key_points: [
      `Klíčový poznatek z videa: ${title}`,
      `Analýza témat prezentovaných kanálem ${channel}`,
      'Praktická aplikace pro moderní vývoj a datové inženýrství',
    ],
    action_items: [
      `Prozkoumat postupy uvedené ve videu "${title}"`,
      'Zařadit poznatky do osobního Second Brain / Notion',
    ],
    para_location: '30_ZDROJE — vzdělávací materiál k tématu',
    relevance_score: 8,
    recommended_tags: ['productivity', 'llm', 'career'],
  }
}
