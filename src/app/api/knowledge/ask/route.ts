import { NextRequest, NextResponse } from 'next/server'
import { GoogleGenAI } from '@google/genai'
import { getAllKnowledgeItems, KnowledgeItem } from '@/lib/knowledge'

export async function POST(req: NextRequest) {
  try {
    const { question, lang = 'cz' } = await req.json()
    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json({ error: lang === 'en' ? 'Question is required' : 'Dotaz je povinný' }, { status: 400 })
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
[SOURCE #${idx + 1}]
Title: ${it.title} (${it.channel})
Score: ${it.score}/10 | P.A.R.A.: ${it.para}
TL;DR: ${it.tldr}
Key Insights:
${it.keyPoints.map(p => ` - ${p}`).join('\n')}
${it.actionItems.length > 0 ? `Action Items:\n${it.actionItems.map(a => ` - ${a}`).join('\n')}` : ''}
Tags: ${it.tags.join(', ')}
`).join('\n---\n')

    let answerText = ''

    if (process.env.GEMINI_API_KEY) {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY })
        const targetLanguage = lang === 'en' ? 'English' : 'Czech'
        const prompt = `You are AIVOS — personal Second Brain and knowledge base for a Junior Data Engineer (Azure, Databricks, Python, AI, Claude ecosystem, P.A.R.A. in Notion).
Answer the user's question based on the following extracted knowledge records from their database.

USER QUESTION: "${question}"

SECOND BRAIN KNOWLEDGE CONTEXT:
${contextText}

Respond clearly and structurally in ${targetLanguage}. Include:
1. Direct clear answer & synthesis
2. Key takeaway bullet points / rules
3. Concrete action items or SOP recommendations
4. Attribution/mention of which sources or videos this insight comes from

Format with clean, readable Markdown.`

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
      if (lang === 'en') {
        answerText = `Based on your Second Brain knowledge base for **"${question}"**:\n\n` +
          `Primary Source: **${top.title}** (${top.channel}, Score ${top.score}/10).\n\n` +
          `**Synthesis:**\n${top.tldr}\n\n` +
          `**Key Insights from Knowledge Base:**\n` +
          relevantItems.flatMap(r => r.keyPoints.slice(0, 2)).map(p => `• ${p}`).join('\n') +
          (relevantItems.some(r => r.actionItems.length > 0)
            ? `\n\n**Recommended Action Steps:**\n` + relevantItems.flatMap(r => r.actionItems).slice(0, 3).map(a => `→ ${a}`).join('\n')
            : '')
      } else {
        answerText = `Na základě tvé znalostní báze k dotazu **"${question}"**:\n\n` +
          `Klíčový zdroj: **${top.title}** (${top.channel}, Skóre ${top.score}/10).\n\n` +
          `**Syntéza:**\n${top.tldr}\n\n` +
          `**Hlavní poznatky ze znalostní báze:**\n` +
          relevantItems.flatMap(r => r.keyPoints.slice(0, 2)).map(p => `• ${p}`).join('\n') +
          (relevantItems.some(r => r.actionItems.length > 0)
            ? `\n\n**Doporučené kroky:**\n` + relevantItems.flatMap(r => r.actionItems).slice(0, 3).map(a => `→ ${a}`).join('\n')
            : '')
      }
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
