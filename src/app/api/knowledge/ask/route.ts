import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { getAllKnowledgeItems, KnowledgeItem } from '@/lib/knowledge'

export async function POST(req: NextRequest) {
  try {
    const { question } = await req.json()
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: 'Dotaz je povinný' }, { status: 400 })
    }

    const items = await getAllKnowledgeItems()
    const qLower = question.toLowerCase()
    const keywords = qLower.split(/\s+/).filter(k => k.length > 2)

    // Score items by relevance to the question
    const scoredItems = items.map(item => {
      let score = 0
      const fullText = `${item.title} ${item.channel} ${item.tldr} ${item.keyPoints.join(' ')} ${item.actionItems.join(' ')} ${item.tags.join(' ')}`.toLowerCase()

      for (const kw of keywords) {
        if (item.title.toLowerCase().includes(kw)) score += 5
        if (item.tags.some(t => t.toLowerCase().includes(kw))) score += 4
        if (item.tldr.toLowerCase().includes(kw)) score += 3
        if (item.keyPoints.some(p => p.toLowerCase().includes(kw))) score += 3
        if (fullText.includes(kw)) score += 1
      }

      if (item.score >= 8) score += 2 // Give boost to high-priority knowledge

      return { item, matchScore: score }
    })

    scoredItems.sort((a, b) => b.matchScore - a.matchScore)
    const topMatches = scoredItems.filter(s => s.matchScore > 0).slice(0, 7).map(s => s.item)
    const relevantItems = topMatches.length > 0 ? topMatches : items.slice(0, 5)

    const contextText = relevantItems.map((it, idx) => `
[ZDROJ #${idx + 1}]
Název: ${it.title} (${it.channel})
Skóre: ${it.score}/10 | P.A.R.A.: ${it.para}
TL;DR: ${it.tldr}
Klíčové poznatky:
${it.keyPoints.map(p => ` - ${p}`).join('\n')}
${it.actionItems.length > 0 ? `Akční kroky:\n${it.actionItems.map(a => ` - ${a}`).join('\n')}` : ''}
Tagy: ${it.tags.join(', ')}
`).join('\n---\n')

    let answerText = ''
    let keyTakeaways: string[] = []
    let recommendedActions: string[] = []

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        const prompt = `Jsi AIVOS — osobní Second Brain a znalostní báze pro Junior Data Engineera (Azure, Databricks, Python, AI, Claude ecosystem, P.A.R.A. v Notion).
Odpověz na otázku uživatele na základě následujících extrahovaných znalostních záznamů z jeho databáze.

OTÁZKA: "${question}"

ZNALOSTNÍ KONTEXT ZE SECOND BRAIN:
${contextText}

Odpověz strukturovaně v češtině. Zahrň:
1. Přímou srozumitelnou odpověď a syntézu
2. Konkrétní odrážky s klíčovými principy/pravidly
3. Akční kroky / doporučení
4. Zmínku, z jakých zdrojů/videí tyto poznatky pocházejí

Formátuj srozumitelným markdownem.`

        const res = await ai.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: prompt,
        })
        answerText = res.text?.trim() || ''
      } catch (e) {
        console.warn('[AI Ask] Gemini generation failed:', e)
      }
    }

    // Fallback if no Gemini key or offline
    if (!answerText) {
      const top = relevantItems[0]
      answerText = `Na základě tvé znalostní báze k dotazu **"${question}"**:\n\n` +
        `Klíčový zdroj: **${top.title}** (${top.channel}, Skóre ${top.score}/10).\n\n` +
        `**Syntéza:**\n${top.tldr}\n\n` +
        `**Hlavní poznatky ze znalostní báze:**\n` +
        relevantItems.flatMap(r => r.keyPoints.slice(0, 2)).map(p => `• ${p}`).join('\n') +
        (relevantItems.some(r => r.actionItems.length > 0)
          ? `\n\n**Doporučené kroky:**\n` + relevantItems.flatMap(r => r.actionItems).slice(0, 3).map(a => `→ ${a}`).join('\n')
          : '')
    }

    return NextResponse.json({
      answer: answerText,
      sources: relevantItems.map(r => ({
        id: r.id,
        videoId: r.videoId,
        title: r.title,
        channel: r.channel,
        score: r.score,
        tier: r.tier,
        para: r.para,
        sourceUrl: r.sourceUrl,
        tldr: r.tldr,
      })),
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
