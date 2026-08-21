'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Language, translations } from '@/lib/i18n'

type KnowledgeItem = {
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
}

type KnowledgeStats = {
  totalKnowledgeRecords: number
  tier1HighPriority: number
  actionItemsCount: number
  paraCounts: Record<string, number>
  topTags: { name: string; count: number }[]
}

type AISource = {
  id: string | number
  videoId: string
  title: string
  channel: string
  score: number
  tier: string
  para: string
  sourceUrl: string
  tldr: string
}

export default function Home() {
  const [lang, setLang] = useState<Language>('cz')
  const [activeTab, setActiveTab] = useState<'vault' | 'ai' | 'table' | 'ingest'>('vault')
  const [items, setItems] = useState<KnowledgeItem[]>([])
  const [stats, setStats] = useState<KnowledgeStats | null>(null)
  const [loading, setLoading] = useState(true)

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedPara, setSelectedPara] = useState('all')
  const [selectedTier, setSelectedTier] = useState('all')
  const [selectedTag, setSelectedTag] = useState('all')

  // AI Assistant state
  const [aiQuestion, setAiQuestion] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnswer, setAiAnswer] = useState<string | null>(null)
  const [aiSources, setAiSources] = useState<AISource[]>([])

  // Ingestion state
  const [singleUrl, setSingleUrl] = useState('')
  const [batchUrls, setBatchUrls] = useState('')
  const [ingesting, setIngesting] = useState(false)
  const [ingestProgress, setIngestProgress] = useState<{ current: number; total: number } | null>(null)

  // Feedback Toast
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Initialize language from localStorage
  useEffect(() => {
    try {
      const savedLang = localStorage.getItem('aivos_lang') as Language
      if (savedLang === 'cz' || savedLang === 'en') {
        setLang(savedLang)
      }
    } catch {
      // ignore
    }
  }, [])

  const handleSetLang = (newLang: Language) => {
    setLang(newLang)
    try {
      localStorage.setItem('aivos_lang', newLang)
    } catch {
      // ignore
    }
  }

  const t = translations[lang]

  const notify = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  // Load knowledge base
  const loadKnowledge = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      if (selectedPara !== 'all') params.set('para', selectedPara)
      if (selectedTier !== 'all') params.set('tier', selectedTier)
      if (selectedTag !== 'all') params.set('tag', selectedTag)
      params.set('limit', '120')

      const res = await fetch(`/api/knowledge?${params.toString()}`)
      const data = await res.json()
      if (res.ok) {
        setItems(data.items || [])
        setStats(data.stats || null)
      }
    } catch {
      notify('err', t.loadFailedToast)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, selectedPara, selectedTier, selectedTag, t.loadFailedToast])

  useEffect(() => {
    loadKnowledge()
  }, [loadKnowledge])

  // AI Ask Handler
  const handleAskAI = async (customPrompt?: string) => {
    const query = customPrompt || aiQuestion
    if (!query.trim()) return

    setAiLoading(true)
    setAiAnswer(null)
    setAiSources([])

    try {
      const res = await fetch('/api/knowledge/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query.trim(), lang }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Chyba při dotazování')
      setAiAnswer(data.answer)
      setAiSources(data.sources || [])
    } catch (e) {
      notify('err', e instanceof Error ? e.message : 'AI error')
    } finally {
      setAiLoading(false)
    }
  }

  // Ingestion Single URL
  const handleIngestSingle = async () => {
    if (!singleUrl.trim()) return
    setIngesting(true)
    try {
      const res = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: singleUrl.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // Automatically trigger summarization
      if (data.video?.id) {
        await fetch('/api/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoId: data.video.id }),
        })
      }

      notify('ok', t.ingestSuccessToast)
      setSingleUrl('')
      loadKnowledge()
      setActiveTab('vault')
    } catch (e) {
      notify('err', e instanceof Error ? e.message : 'Chyba při extrakci')
    } finally {
      setIngesting(false)
    }
  }

  // Ingestion Batch URLs
  const handleIngestBatch = async () => {
    const rawLines = batchUrls.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)
    const validUrls = rawLines.filter(u => u.includes('youtube.com') || u.includes('youtu.be'))
    if (validUrls.length === 0) {
      notify('err', t.ingestNoUrlsToast)
      return
    }

    setIngestProgress({ current: 0, total: validUrls.length })
    let count = 0

    for (let i = 0; i < validUrls.length; i++) {
      const u = validUrls[i]
      setIngestProgress({ current: i + 1, total: validUrls.length })
      try {
        const res = await fetch('/api/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: u }),
        })
        const data = await res.json()
        if (data.video?.id) {
          await fetch('/api/summarize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ videoId: data.video.id }),
          })
        }
        count++
      } catch {
        // continue
      }
    }

    notify('ok', t.ingestBatchSuccessToast(count, validUrls.length))
    setBatchUrls('')
    setIngestProgress(null)
    loadKnowledge()
    setActiveTab('vault')
  }

  // Copy to Notion Markdown format
  const handleCopyToNotion = (item: KnowledgeItem) => {
    const md = `---
title: "${item.title}"
channel: "${item.channel}"
source: "${item.sourceUrl}"
date: "${item.date}"
score: ${item.score}
tier: "${item.tier}"
para: "${item.para}"
tags: ${item.tags.join(', ')}
---

# ${item.title}

> ${item.tier === 'HIGH' ? '🟢 TIER 1 HIGH' : '🟡 TIER 2'} | Score: ${item.score}/10 | ${item.channel} | ${item.para}

## TL;DR
${item.tldr}

## ${lang === 'en' ? 'Key Insights' : 'Klíčové poznatky (Key Insights)'}
${item.keyPoints.map(k => `- ${k}`).join('\n')}

${item.actionItems.length > 0 ? `## ${lang === 'en' ? 'Action Items' : 'Akční kroky (Action Items)'}\n${item.actionItems.map(a => `- [ ] ${a}`).join('\n')}\n` : ''}
`
    navigator.clipboard.writeText(md)
    notify('ok', t.notionCopiedToast)
  }

  return (
    <div className="container">
      {message && <div className={`toast toast-${message.type}`}>{message.text}</div>}

      {/* App Header */}
      <header className="app-header">
        <div>
          <div className="app-title-row">
            <span className="app-title">{t.appName}</span>
            <span className="app-version">{t.appVersion}</span>
          </div>
          <div className="app-subtitle">
            {t.appSubtitle}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Language Switcher Button (CZ / EN) */}
          <div className="lang-switcher" id="lang-switcher-control" aria-label="Language selector">
            <button
              id="lang-cz-btn"
              className={`lang-btn ${lang === 'cz' ? 'active' : ''}`}
              onClick={() => handleSetLang('cz')}
              title="Čeština"
            >
              🇨🇿 CZ
            </button>
            <button
              id="lang-en-btn"
              className={`lang-btn ${lang === 'en' ? 'active' : ''}`}
              onClick={() => handleSetLang('en')}
              title="English"
            >
              🇬🇧 EN
            </button>
          </div>

          <Link
            id="header-brief-link"
            href="/brief"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(99,80,255,0.15)',
              border: '1px solid rgba(99,80,255,0.35)',
              color: '#a5b4fc',
              padding: '6px 13px',
              borderRadius: 10,
              textDecoration: 'none',
              fontSize: '0.825rem',
              fontWeight: 600,
              fontFamily: 'var(--mono)',
            }}
          >
            {t.dailyBriefsBtn}
          </Link>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-tabs" id="main-nav-tabs">
        <button
          id="tab-vault-btn"
          className={`nav-tab-btn ${activeTab === 'vault' ? 'active' : ''}`}
          onClick={() => setActiveTab('vault')}
        >
          {t.tabVault}
        </button>
        <button
          id="tab-table-btn"
          className={`nav-tab-btn ${activeTab === 'table' ? 'active' : ''}`}
          onClick={() => setActiveTab('table')}
        >
          {t.tabTable}
        </button>
        <button
          id="tab-ai-btn"
          className={`nav-tab-btn ${activeTab === 'ai' ? 'active' : ''}`}
          onClick={() => setActiveTab('ai')}
        >
          {t.tabAi}
        </button>
        <button
          id="tab-ingest-btn"
          className={`nav-tab-btn ${activeTab === 'ingest' ? 'active' : ''}`}
          onClick={() => setActiveTab('ingest')}
        >
          {t.tabIngest}
        </button>
      </nav>

      {/* Top Stats Overview */}
      <div className="stats-grid">
        <div className="stat-card" id="stat-total-records">
          <div className="stat-icon-wrap" style={{ color: 'var(--accent-hi)' }}>🧠</div>
          <div>
            <div className="stat-value" style={{ color: 'var(--accent-hi)' }}>
              {stats?.totalKnowledgeRecords ?? items.length}
            </div>
            <div className="stat-label">{t.statTotalRecords}</div>
          </div>
        </div>
        <div className="stat-card" id="stat-tier1-records">
          <div className="stat-icon-wrap" style={{ color: 'var(--green)' }}>🔥</div>
          <div>
            <div className="stat-value" style={{ color: 'var(--green)' }}>
              {stats?.tier1HighPriority ?? items.filter(i => i.score >= 8).length}
            </div>
            <div className="stat-label">{t.statTier1}</div>
          </div>
        </div>
        <div className="stat-card" id="stat-action-items">
          <div className="stat-icon-wrap" style={{ color: 'var(--yellow)' }}>⚡</div>
          <div>
            <div className="stat-value" style={{ color: 'var(--yellow)' }}>
              {stats?.actionItemsCount ?? items.reduce((acc, i) => acc + i.actionItems.length, 0)}
            </div>
            <div className="stat-label">{t.statActionItems}</div>
          </div>
        </div>
        <div className="stat-card" id="stat-para-active">
          <div className="stat-icon-wrap" style={{ color: '#60a5fa' }}>📁</div>
          <div>
            <div className="stat-value" style={{ color: '#60a5fa' }}>
              {stats?.paraCounts?.['10_PROJEKTY'] ?? 15}
            </div>
            <div className="stat-label">{t.statParaProjects}</div>
          </div>
        </div>
      </div>

      {/* TAB 1 & 2: KNOWLEDGE VAULT & TABLE MATRIX */}
      {(activeTab === 'vault' || activeTab === 'table') && (
        <>
          {/* Filter & Search Bar */}
          <div className="filter-search-card" id="knowledge-filter-box">
            <div className="search-input-row">
              <input
                id="knowledge-search-input"
                className="search-input"
                type="text"
                placeholder={t.searchPlaceholder}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  id="clear-search-btn"
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'var(--surface-hi)',
                    border: '1px solid var(--border-hi)',
                    color: 'var(--muted)',
                    borderRadius: 8,
                    padding: '0 12px',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* P.A.R.A. Folder Filter */}
            <div style={{ marginBottom: '0.625rem', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.725rem', fontFamily: 'var(--mono)', color: 'var(--muted)', marginRight: 4 }}>
                {t.paraLabel}
              </span>
              {[
                { id: 'all', label: `${t.paraAll} (${stats?.totalKnowledgeRecords || items.length})` },
                { id: '10_PROJEKTY', label: `10_PROJEKTY (${stats?.paraCounts?.['10_PROJEKTY'] || 0})` },
                { id: '20_OBLASTI', label: `20_OBLASTI (${stats?.paraCounts?.['20_OBLASTI'] || 0})` },
                { id: '30_ZDROJE', label: `30_ZDROJE (${stats?.paraCounts?.['30_ZDROJE'] || 0})` },
                { id: '40_ARCHIV', label: `40_ARCHIV (${stats?.paraCounts?.['40_ARCHIV'] || 0})` },
              ].map(f => (
                <button
                  key={f.id}
                  id={`para-filter-${f.id}`}
                  className={`filter-pill-btn ${selectedPara === f.id ? 'active' : ''}`}
                  onClick={() => setSelectedPara(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Relevance Score & Priority Tier Filter */}
            <div className="filter-pills-row">
              <span style={{ fontSize: '0.725rem', fontFamily: 'var(--mono)', color: 'var(--muted)', marginRight: 4 }}>
                {t.relevanceLabel}
              </span>
              {[
                { id: 'all', label: t.relevanceAll },
                { id: 'high', label: t.relevanceHigh },
                { id: 'medium', label: t.relevanceMed },
                { id: 'low', label: t.relevanceLow },
              ].map(tr => (
                <button
                  key={tr.id}
                  id={`tier-filter-${tr.id}`}
                  className={`filter-pill-btn ${selectedTier === tr.id ? 'active' : ''}`}
                  onClick={() => setSelectedTier(tr.id)}
                >
                  {tr.label}
                </button>
              ))}

              {/* Tag Quick Filter */}
              {stats?.topTags && stats.topTags.length > 0 && (
                <select
                  id="tag-quick-select"
                  className="filter-pill-btn"
                  style={{ marginLeft: 'auto', background: 'var(--surface-hi)', color: 'var(--text)' }}
                  value={selectedTag}
                  onChange={(e) => setSelectedTag(e.target.value)}
                >
                  <option value="all">{t.allTags} ({stats.topTags.length})</option>
                  {stats.topTags.map(tg => (
                    <option key={tg.name} value={tg.name}>
                      #{tg.name} ({tg.count})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* Results Summary Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              {t.foundRecords} <strong style={{ color: 'var(--text)' }}>{items.length}</strong> {t.recordsCountLabel}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                id="switch-to-vault-view"
                className={`filter-pill-btn ${activeTab === 'vault' ? 'active' : ''}`}
                onClick={() => setActiveTab('vault')}
              >
                {t.viewCards}
              </button>
              <button
                id="switch-to-table-view"
                className={`filter-pill-btn ${activeTab === 'table' ? 'active' : ''}`}
                onClick={() => setActiveTab('table')}
              >
                {t.viewTable}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="knowledge-grid" id="knowledge-skeleton-grid">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <div key={n} className="k-card-skeleton">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="skeleton" style={{ width: '65%', height: '22px' }} />
                    <div className="skeleton" style={{ width: '70px', height: '22px', borderRadius: '6px' }} />
                  </div>
                  <div className="skeleton" style={{ width: '40%', height: '14px' }} />
                  <div className="skeleton" style={{ width: '130px', height: '18px', borderRadius: '4px' }} />
                  <div className="skeleton" style={{ width: '100%', height: '55px', borderRadius: '8px' }} />
                  <div className="skeleton" style={{ width: '90%', height: '16px' }} />
                  <div className="skeleton" style={{ width: '80%', height: '16px' }} />
                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                    <div className="skeleton" style={{ width: '50px', height: '18px' }} />
                    <div className="skeleton" style={{ width: '60px', height: '18px' }} />
                    <div className="skeleton" style={{ width: '45px', height: '18px' }} />
                  </div>
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📭</div>
              <div className="empty-text">{t.noRecordsFound}</div>
            </div>
          ) : activeTab === 'vault' ? (
            /* Card Grid View */
            <div className="knowledge-grid" id="knowledge-cards-grid">
              {items.map(item => (
                <div
                  key={item.id}
                  id={`knowledge-card-${item.id}`}
                  className={`k-card ${item.score >= 8 ? 'tier-high' : item.score >= 5 ? 'tier-med' : ''}`}
                >
                  <div>
                    <div className="k-card-top">
                      <div>
                        <div className="k-card-title">{item.title}</div>
                        <div className="k-card-channel">{item.channel} · {item.date}</div>
                      </div>
                      <span className={`k-score-pill ${item.score >= 8 ? 'k-score-high' : item.score >= 5 ? 'k-score-med' : 'k-score-low'}`}>
                        {item.score}/10 {item.score >= 8 ? t.tier1Badge : item.score >= 5 ? t.tier2Badge : t.tier3Badge}
                      </span>
                    </div>

                    <div className="k-para-badge">
                      📁 {item.para}
                    </div>

                    {item.tldr && (
                      <div className="k-tldr-box">
                        {item.tldr}
                      </div>
                    )}

                    {item.keyPoints.length > 0 && (
                      <ul className="k-points-list">
                        {item.keyPoints.slice(0, 4).map((pt, idx) => (
                          <li key={idx} className="k-point-item">
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    )}

                    {item.actionItems.length > 0 && (
                      <div className="k-actions-box">
                        <div className="k-actions-label">{t.actionLabel}</div>
                        {item.actionItems.map((act, idx) => (
                          <div key={idx} className="k-action-item">
                            → {act}
                          </div>
                        ))}
                      </div>
                    )}

                    {item.tags.length > 0 && (
                      <div className="k-tags-row">
                        {item.tags.map(tagItem => (
                          <span key={tagItem} className="k-tag">#{tagItem.replace(/^#/, '')}</span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="k-card-footer">
                    <button
                      id={`copy-notion-${item.id}`}
                      className="k-copy-btn"
                      onClick={() => handleCopyToNotion(item)}
                      title="Zkopíruje formátovaný markdown pro Notion"
                    >
                      {t.copyToNotion}
                    </button>

                    {item.sourceUrl && (
                      <a
                        href={item.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="k-source-link"
                      >
                        {t.sourceVideoLink}
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            /* Dense Table Matrix View */
            <div className="table-wrap" id="knowledge-table-wrap">
              <table className="k-table" id="knowledge-matrix-table">
                <thead>
                  <tr>
                    <th style={{ width: '80px' }}>{t.tableScore}</th>
                    <th style={{ width: '240px' }}>{t.tableNameChannel}</th>
                    <th style={{ width: '180px' }}>{t.tablePara}</th>
                    <th>{t.tableInsights}</th>
                    <th style={{ width: '180px' }}>{t.tableAction}</th>
                    <th style={{ width: '140px' }}>{t.tableActionsCol}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id}>
                      <td>
                        <span className={`k-score-pill ${item.score >= 8 ? 'k-score-high' : item.score >= 5 ? 'k-score-med' : 'k-score-low'}`}>
                          {item.score}/10
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 600, color: '#fff', marginBottom: 2 }}>{item.title}</div>
                        <div style={{ fontSize: '0.725rem', color: 'var(--muted)' }}>{item.channel} ({item.date})</div>
                      </td>
                      <td>
                        <span className="k-para-badge" style={{ marginBottom: 0 }}>
                          {item.para}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontSize: '0.8rem', color: '#d1d5db', marginBottom: 4 }}>
                          {item.tldr}
                        </div>
                        {item.keyPoints.length > 0 && (
                          <div style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>
                            • {item.keyPoints[0]}
                          </div>
                        )}
                      </td>
                      <td>
                        {item.actionItems.length > 0 ? (
                          <div style={{ fontSize: '0.75rem', color: '#86efac' }}>
                            → {item.actionItems[0]}
                          </div>
                        ) : (
                          <span style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        <button
                          id={`table-copy-${item.id}`}
                          className="k-copy-btn"
                          style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                          onClick={() => handleCopyToNotion(item)}
                        >
                          📋 Notion
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* TAB 3: AI ASSISTANT / SECOND BRAIN Q&A */}
      {activeTab === 'ai' && (
        <div className="ai-assistant-card" id="ai-assistant-panel">
          <div className="ai-header">
            <div className="ai-title">
              <span>🤖</span>
              <span>{t.aiTitle}</span>
            </div>
            <span className="ai-badge">{t.aiBadge}</span>
          </div>

          <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginBottom: '1rem' }}>
            {t.aiSubtitle}
          </p>

          <div className="ai-input-wrap">
            <input
              id="ai-question-input"
              className="ai-input"
              type="text"
              placeholder={t.aiInputPlaceholder}
              value={aiQuestion}
              onChange={(e) => setAiQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskAI()}
            />
            <button
              id="ai-ask-submit-btn"
              className="ai-submit-btn"
              onClick={() => handleAskAI()}
              disabled={aiLoading || !aiQuestion.trim()}
            >
              {aiLoading ? t.aiSynthesizing : t.aiAskBtn}
            </button>
          </div>

          {/* Quick Prompt Suggestions */}
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ fontSize: '0.725rem', fontFamily: 'var(--mono)', color: 'var(--muted)', marginBottom: 6 }}>
              {t.aiPromptsLabel}
            </div>
            <div className="ai-prompts-row">
              {t.aiPrompts.map((promptText, idx) => (
                <button
                  key={idx}
                  id={`prompt-pill-${idx}`}
                  className="ai-prompt-pill"
                  onClick={() => {
                    setAiQuestion(promptText)
                    handleAskAI(promptText)
                  }}
                >
                  💡 {promptText}
                </button>
              ))}
            </div>
          </div>

          {/* AI Response Display */}
          {aiAnswer && (
            <div className="ai-response-box" id="ai-answer-box">
              <div style={{ fontSize: '0.75rem', fontFamily: 'var(--mono)', color: 'var(--accent-hi)', marginBottom: 8, fontWeight: 700 }}>
                {t.aiSynthesisHeader}
              </div>
              <div className="ai-response-content">
                {aiAnswer}
              </div>

              {aiSources.length > 0 && (
                <div className="ai-response-sources">
                  <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                    {t.aiSourcesUsed}
                  </span>
                  {aiSources.map((src, idx) => (
                    <a
                      key={idx}
                      href={src.sourceUrl || '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ai-source-chip"
                      title={src.tldr}
                    >
                      {src.score}/10 · {src.title} ({src.channel})
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: INGESTION & PIPELINE */}
      {activeTab === 'ingest' && (
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          {/* Single URL Extractor */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem', marginBottom: '1.5rem' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {t.ingestSingleTitle}
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--muted)', marginBottom: '1rem' }}>
              {t.ingestSingleDesc}
            </p>

            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="single-ingest-input"
                className="ai-input"
                type="text"
                placeholder="https://www.youtube.com/watch?v=..."
                value={singleUrl}
                onChange={(e) => setSingleUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleIngestSingle()}
              />
              <button
                id="single-ingest-submit-btn"
                className="fetch-btn"
                style={{ borderRadius: 12, padding: '0 1.25rem' }}
                onClick={handleIngestSingle}
                disabled={ingesting || !singleUrl.trim()}
              >
                {ingesting ? t.ingestSingleLoading : t.ingestSingleBtn}
              </button>
            </div>
          </div>

          {/* Batch Ingest Box */}
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: '1.5rem' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {t.ingestBatchTitle}
            </div>
            <p style={{ fontSize: '0.825rem', color: 'var(--muted)', marginBottom: '1rem' }}>
              {t.ingestBatchDesc}
            </p>

            <textarea
              id="batch-ingest-textarea"
              className="batch-area"
              rows={6}
              placeholder={"https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=..."}
              value={batchUrls}
              onChange={(e) => setBatchUrls(e.target.value)}
            />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: '0.75rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
                {ingestProgress ? t.ingestBatchProgress(ingestProgress.current, ingestProgress.total) : t.ingestBatchHelper}
              </div>
              <button
                id="batch-ingest-submit-btn"
                className="fetch-btn"
                style={{ borderRadius: 12, padding: '0.5rem 1.25rem' }}
                onClick={handleIngestBatch}
                disabled={!!ingestProgress || !batchUrls.trim()}
              >
                {ingestProgress ? `⏳ (${ingestProgress.current}/${ingestProgress.total})` : t.ingestBatchBtn}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* App Footer */}
      <footer className="app-footer">
        {t.footerText}
      </footer>
    </div>
  )
}
