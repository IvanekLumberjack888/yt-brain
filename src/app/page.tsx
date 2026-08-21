'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import Image from 'next/image'

type Video = {
  id: number
  video_id: string
  title: string | null
  channel: string | null
  transcript: string | null
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
  priority: 'high' | 'medium' | 'low'
  status: 'to_watch' | 'in_progress' | 'done' | 'skip'
  created_at: string
  processed_at: string | null
}

const PRIORITY_LABEL: Record<string, string> = { high: '🔥 High', medium: '📌 Medium', low: '💤 Low' }
const STATUS_LABEL: Record<string, string> = { to_watch: '🔴 To Watch', in_progress: '🟡 In Progress', done: '✅ Done', skip: '⏭️ Skip' }
const SCORE_COLOR = (s: number) => s >= 8 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#6b6b8a'

function thumb(videoId: string) { return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` }

function ScoreDot({ score }: { score: number }) {
  return (
    <span style={{ color: SCORE_COLOR(score), display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'monospace', fontSize: '0.7rem' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: SCORE_COLOR(score), display: 'inline-block' }} />
      {score}/10
    </span>
  )
}

function VideoCard({
  video,
  isSelected,
  onToggleSelect,
  onSummarize,
  onStatusChange,
  onClick,
  isLoading
}: {
  video: Video
  isSelected: boolean
  onToggleSelect: (id: number, e: React.MouseEvent | React.ChangeEvent) => void
  onSummarize: (id: number) => void
  onStatusChange: (id: number, status: string) => void
  onClick: (v: Video) => void
  isLoading: boolean
}) {
  const hasTranscript = !!video.transcript && video.transcript.length > 0

  return (
    <div
      id={`video-card-${video.id}`}
      className={`video-card${video.status === 'skip' ? ' skipped' : ''}${isSelected ? ' selected' : ''}`}
      onClick={() => onClick(video)}
    >
      <div className="thumb-wrap">
        <div
          className="card-checkbox-wrap"
          onClick={(e) => {
            e.stopPropagation()
          }}
        >
          <input
            id={`checkbox-video-${video.id}`}
            type="checkbox"
            className="card-checkbox"
            checked={isSelected}
            onChange={(e) => onToggleSelect(video.id, e)}
            aria-label={`Select ${video.title || 'video'}`}
          />
        </div>
        <img
          src={thumb(video.video_id)}
          alt={video.title || 'YouTube Video'}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
        <span className={`thumb-badge badge-${video.priority}`}>{PRIORITY_LABEL[video.priority]}</span>
        {video.insights?.relevance_score && (
          <span className="thumb-score"><ScoreDot score={video.insights.relevance_score} /></span>
        )}
      </div>
      <div className="card-body">
        <div>
          <div className="card-title">{video.title ?? 'Načítám...'}</div>
          {video.channel && <div className="card-channel">{video.channel}</div>}
        </div>
        {!hasTranscript && !video.summary && (
          <div style={{ fontSize: '0.7rem', color: '#6b6b8a', marginTop: 4 }}>⚠️ Bez transcriptu</div>
        )}
        {video.summary && <div className="card-summary">{video.summary}</div>}
        {video.tags && video.tags.length > 0 && (
          <div className="card-tags">{video.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}</div>
        )}
        {video.insights?.para_location && <div className="card-para">→ {video.insights.para_location}</div>}
        <div className="card-actions" onClick={e => e.stopPropagation()}>
          <select
            id={`status-select-${video.id}`}
            className="status-select"
            value={video.status}
            style={{ color: video.status === 'done' ? '#22c55e' : video.status === 'skip' ? '#6b6b8a' : video.status === 'in_progress' ? '#f59e0b' : '#ef4444' }}
            onChange={e => onStatusChange(video.id, e.target.value)}
          >
            <option value="to_watch">🔴 To Watch</option>
            <option value="in_progress">🟡 In Progress</option>
            <option value="done">✅ Done</option>
            <option value="skip">⏭️ Skip</option>
          </select>
          {!video.summary
            ? (
              <button
                id={`summarize-btn-${video.id}`}
                className="summarize-btn"
                disabled={isLoading || !hasTranscript}
                title={!hasTranscript ? 'Transcript není dostupný' : ''}
                onClick={() => onSummarize(video.id)}
              >
                {isLoading ? '...' : '⚡ Summarize'}
              </button>
            )
            : <span className="processed-badge">✓ done</span>
          }
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ video, onClose }: { video: Video; onClose: () => void }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <div className="modal-title">{video.title}</div>
            {video.channel && <div className="modal-channel">{video.channel}</div>}
          </div>
          <button id="modal-close-btn" className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-thumb">
          <img src={thumb(video.video_id)} alt={video.title || ''} />
        </div>
        <div className="modal-content">
          {video.insights ? (
            <>
              <div className="modal-section">
                <div className="modal-section-label" style={{ color: '#7c6af7' }}>TL;DR</div>
                <p>{video.insights.tldr}</p>
              </div>
              {video.insights.key_points?.length ? (
                <div className="modal-section">
                  <div className="modal-section-label" style={{ color: '#7c6af7' }}>Key Insights</div>
                  <ul className="modal-list">
                    {video.insights.key_points.map((p, i) => (
                      <li key={i}><span style={{ color: '#7c6af7', flexShrink: 0 }}>▸</span>{p}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {video.insights.action_items?.length ? (
                <div className="modal-section">
                  <div className="modal-section-label" style={{ color: '#22c55e' }}>Action Items</div>
                  <ul className="modal-list">
                    {video.insights.action_items.map((a, i) => (
                      <li key={i}><span style={{ color: '#22c55e', flexShrink: 0 }}>→</span>{a}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="modal-meta">
                {video.insights.relevance_score && <ScoreDot score={video.insights.relevance_score} />}
                {video.insights.para_location && <span style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#7c6af7' }}>→ {video.insights.para_location}</span>}
                {video.tags?.map(t => <span key={t} className="tag">{t}</span>)}
              </div>
            </>
          ) : (
            <p style={{ fontSize: '0.875rem', color: '#6b6b8a' }}>Klikni na ⚡ Summarize pro zpracování.</p>
          )}
          <a
            id={`yt-link-${video.id}`}
            href={`https://www.youtube.com/watch?v=${video.video_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="yt-link"
          >
            ▶ Otevřít na YouTube ↗
          </a>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [videos, setVideos] = useState<Video[]>([])
  const [loading, setLoading] = useState(true)
  const [urlInput, setUrlInput] = useState('')
  const [fetchingUrl, setFetchingUrl] = useState(false)
  const [summarizingId, setSummarizingId] = useState<number | null>(null)
  const [selectedVideo, setSelectedVideo] = useState<Video | null>(null)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkActionLoading, setBulkActionLoading] = useState(false)
  const [showBatchImport, setShowBatchImport] = useState(false)
  const [batchUrls, setBatchUrls] = useState('')
  const [batchProgress, setBatchProgress] = useState<{ total: number; current: number } | null>(null)

  const notify = (type: 'ok' | 'err', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3500)
  }

  const loadVideos = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams()
      if (filterStatus !== 'all') p.set('status', filterStatus)
      if (filterPriority !== 'all') p.set('priority', filterPriority)
      const res = await fetch(`/api/videos?${p}`)
      const data = await res.json()
      setVideos(data.videos ?? [])
    } catch { notify('err', 'Chyba při načítání') } finally { setLoading(false) }
  }, [filterStatus, filterPriority])

  useEffect(() => { loadVideos() }, [loadVideos])

  // Clear selections that are no longer in videos list
  useEffect(() => {
    setSelectedIds(prev => {
      const currentIds = new Set(videos.map(v => v.id))
      const next = new Set<number>()
      for (const id of prev) {
        if (currentIds.has(id)) next.add(id)
      }
      return next
    })
  }, [videos])

  const toggleSelectOne = (id: number, e: React.MouseEvent | React.ChangeEvent) => {
    e.stopPropagation()
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const isAllSelected = useMemo(() => {
    if (videos.length === 0) return false
    return videos.every(v => selectedIds.has(v.id))
  }, [videos, selectedIds])

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(videos.map(v => v.id)))
    }
  }

  const handleBulkStatus = async (status: string) => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setBulkActionLoading(true)
    try {
      const res = await fetch('/api/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, status }),
      })
      if (!res.ok) throw new Error('Chyba při hromadné změně')
      setVideos(prev => prev.map(v => selectedIds.has(v.id) ? { ...v, status: status as Video['status'] } : v))
      notify('ok', `Aktualizováno ${ids.length} videí na ${status}`)
    } catch (e) {
      notify('err', e instanceof Error ? e.message : 'Chyba')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkPriority = async (priority: string) => {
    if (selectedIds.size === 0) return
    const ids = Array.from(selectedIds)
    setBulkActionLoading(true)
    try {
      const res = await fetch('/api/videos', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, priority }),
      })
      if (!res.ok) throw new Error('Chyba při hromadné prioritě')
      setVideos(prev => prev.map(v => selectedIds.has(v.id) ? { ...v, priority: priority as Video['priority'] } : v))
      notify('ok', `Priorita nastavena pro ${ids.length} videí`)
    } catch (e) {
      notify('err', e instanceof Error ? e.message : 'Chyba')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return
    const count = selectedIds.size
    const confirmDelete = window.confirm(`Opravdu chceš smazat ${count} vybraných videí?`)
    if (!confirmDelete) return

    const ids = Array.from(selectedIds)
    setBulkActionLoading(true)
    try {
      const res = await fetch('/api/videos', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error('Chyba při mazání videí')
      setVideos(prev => prev.filter(v => !selectedIds.has(v.id)))
      setSelectedIds(new Set())
      notify('ok', `Smazáno ${count} videí`)
    } catch (e) {
      notify('err', e instanceof Error ? e.message : 'Chyba')
    } finally {
      setBulkActionLoading(false)
    }
  }

  const handleFetch = async () => {
    if (!urlInput.trim()) return
    setFetchingUrl(true)
    try {
      const res = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.warning) notify('ok', `Video přidáno ⚠️ ${data.warning}`)
      else notify('ok', data.cached ? 'Už v databázi ✓' : 'Transcript stažen ✓')
      setUrlInput('')
      loadVideos()
    } catch (e) { notify('err', e instanceof Error ? e.message : 'Chyba') } finally { setFetchingUrl(false) }
  }

  const handleBatchImport = async () => {
    const rawLines = batchUrls.split(/[\n,\s]+/).map(s => s.trim()).filter(Boolean)
    const validUrls = rawLines.filter(u => u.includes('youtube.com') || u.includes('youtu.be'))
    if (validUrls.length === 0) {
      notify('err', 'Nenalezeny žádné platné YouTube URL')
      return
    }

    setBatchProgress({ total: validUrls.length, current: 0 })
    let addedCount = 0

    for (let i = 0; i < validUrls.length; i++) {
      const u = validUrls[i]
      setBatchProgress({ total: validUrls.length, current: i + 1 })
      try {
        await fetch('/api/transcript', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: u }),
        })
        addedCount++
      } catch {
        // continue
      }
    }

    notify('ok', `Importováno ${addedCount} z ${validUrls.length} videí`)
    setBatchUrls('')
    setShowBatchImport(false)
    setBatchProgress(null)
    loadVideos()
  }

  const handleSummarize = async (id: number) => {
    setSummarizingId(id)
    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ videoId: id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      notify('ok', data.cached ? 'Z cache ✓' : 'AI zpracování hotovo ✓')
      loadVideos()
    } catch (e) { notify('err', e instanceof Error ? e.message : 'AI chyba') } finally { setSummarizingId(null) }
  }

  const handleStatusChange = async (id: number, status: string) => {
    await fetch('/api/videos', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status }),
    })
    setVideos(prev => prev.map(v => v.id === id ? { ...v, status: status as Video['status'] } : v))
  }

  const stats = {
    total: videos.length,
    processed: videos.filter(v => v.summary).length,
    high: videos.filter(v => v.priority === 'high' && v.status === 'to_watch').length,
    done: videos.filter(v => v.status === 'done').length,
  }

  return (
    <div className="container">
      {message && <div className={`toast toast-${message.type}`}>{message.text}</div>}
      {selectedVideo && <DetailPanel video={selectedVideo} onClose={() => setSelectedVideo(null)} />}

      <header style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div>
            <span className="app-title">YT_BRAIN</span>
            <span className="app-version">v0.1 — second brain pipeline</span>
          </div>
          <div className="app-subtitle">Stáhni transcript → ulož → summarizuj on-demand → exportuj do Notion</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            id="batch-import-toggle-btn"
            className="batch-toggle-btn"
            onClick={() => setShowBatchImport(!showBatchImport)}
          >
            {showBatchImport ? '▲ Zavřít Batch' : '📋 Hromadný import'}
          </button>
          <Link
            id="brief-nav-link"
            href="/brief"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: 'rgba(99,80,255,0.15)',
              border: '1px solid rgba(99,80,255,0.35)',
              color: '#a5b4fc',
              padding: '8px 14px',
              borderRadius: 10,
              textDecoration: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              fontFamily: 'var(--mono)',
            }}
          >
            🧠 Denní Brief →
          </Link>
        </div>
      </header>

      {/* Batch Import Box */}
      {showBatchImport && (
        <div style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-hi)',
          borderRadius: 14,
          padding: '1rem',
          marginBottom: '1.5rem',
        }}>
          <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text)', marginBottom: 6, fontFamily: 'var(--mono)' }}>
            Hromadný import YouTube URL (oddělené novým řádkem):
          </div>
          <textarea
            id="batch-urls-textarea"
            className="batch-area"
            value={batchUrls}
            onChange={(e) => setBatchUrls(e.target.value)}
            placeholder={"https://www.youtube.com/watch?v=...\nhttps://www.youtube.com/watch?v=..."}
            rows={4}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: '0.725rem', color: 'var(--muted)', fontFamily: 'var(--mono)' }}>
              {batchProgress ? `Importuji ${batchProgress.current}/${batchProgress.total}...` : 'Podporuje více odkazů naráz.'}
            </div>
            <button
              id="batch-import-submit-btn"
              className="fetch-btn"
              onClick={handleBatchImport}
              disabled={!!batchProgress || !batchUrls.trim()}
            >
              {batchProgress ? `⏳ (${batchProgress.current}/${batchProgress.total})` : 'Importovat vše'}
            </button>
          </div>
        </div>
      )}

      {/* Bulk Action Sticky Bar */}
      {selectedIds.size > 0 && (
        <div className="bulk-bar-container" id="bulk-action-bar-container">
          <div className="bulk-action-bar" id="bulk-action-bar">
            <div className="bulk-left">
              <label className="bulk-select-all" id="bulk-select-all-label">
                <input
                  id="bulk-select-all-checkbox"
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={toggleSelectAll}
                />
                <span>Vše ({videos.length})</span>
              </label>
              <span className="bulk-badge" id="bulk-selected-badge">{selectedIds.size} vybráno</span>
            </div>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--mono)', marginRight: 2 }}>
                Stav:
              </span>
              <button
                id="bulk-status-to-watch-btn"
                className="bulk-btn"
                disabled={bulkActionLoading}
                onClick={() => handleBulkStatus('to_watch')}
              >
                🔴 To Watch
              </button>
              <button
                id="bulk-status-in-progress-btn"
                className="bulk-btn"
                disabled={bulkActionLoading}
                onClick={() => handleBulkStatus('in_progress')}
              >
                🟡 In Progress
              </button>
              <button
                id="bulk-status-done-btn"
                className="bulk-btn"
                disabled={bulkActionLoading}
                onClick={() => handleBulkStatus('done')}
              >
                ✅ Done
              </button>
              <button
                id="bulk-status-skip-btn"
                className="bulk-btn"
                disabled={bulkActionLoading}
                onClick={() => handleBulkStatus('skip')}
              >
                ⏭️ Skip
              </button>

              <span style={{ fontSize: '0.7rem', color: 'var(--muted)', fontFamily: 'var(--mono)', marginLeft: 6, marginRight: 2 }}>
                Priorita:
              </span>
              <button
                id="bulk-priority-high-btn"
                className="bulk-btn"
                disabled={bulkActionLoading}
                onClick={() => handleBulkPriority('high')}
              >
                🔥 High
              </button>
              <button
                id="bulk-priority-med-btn"
                className="bulk-btn"
                disabled={bulkActionLoading}
                onClick={() => handleBulkPriority('medium')}
              >
                📌 Med
              </button>
              <button
                id="bulk-priority-low-btn"
                className="bulk-btn"
                disabled={bulkActionLoading}
                onClick={() => handleBulkPriority('low')}
              >
                💤 Low
              </button>

              <button
                id="bulk-delete-btn"
                className="bulk-btn bulk-btn-delete"
                disabled={bulkActionLoading}
                onClick={handleBulkDelete}
                style={{ marginLeft: 6 }}
              >
                🗑️ Smazat ({selectedIds.size})
              </button>

              <button
                id="bulk-clear-selection-btn"
                className="bulk-btn"
                onClick={() => setSelectedIds(new Set())}
                style={{ marginLeft: 4 }}
                title="Zrušit výběr"
              >
                ✕
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="stats-grid">
        {[
          { label: 'celkem',     value: stats.total,     color: '#9d8fff' },
          { label: 'zpracováno', value: stats.processed,  color: '#22c55e' },
          { label: '🔥 high',   value: stats.high,       color: '#ef4444' },
          { label: '✅ done',   value: stats.done,       color: '#6b6b8a' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card" id={`stat-card-${label}`}>
            <div className="stat-value" style={{ color }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="url-row">
        <input
          id="url-input"
          className="url-input"
          type="text"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleFetch()}
          placeholder="https://youtube.com/watch?v=..."
        />
        <button id="fetch-url-btn" className="fetch-btn" onClick={handleFetch} disabled={fetchingUrl || !urlInput.trim()}>
          {fetchingUrl ? '↓ ...' : '↓ Fetch'}
        </button>
      </div>

      <div className="filter-row">
        <div className="filter-group">
          {['all', 'to_watch', 'in_progress', 'done', 'skip'].map(s => (
            <button
              key={s}
              id={`filter-status-${s}-btn`}
              className={`filter-btn${filterStatus === s ? ' active' : ''}`}
              onClick={() => setFilterStatus(s)}
            >
              {s === 'all' ? 'all' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="filter-group">
          {['all', 'high', 'medium', 'low'].map(p => (
            <button
              key={p}
              id={`filter-priority-${p}-btn`}
              className={`filter-btn${filterPriority === p ? ' active' : ''}`}
              onClick={() => setFilterPriority(p)}
            >
              {p === 'all' ? 'all' : PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>

        {videos.length > 0 && selectedIds.size === 0 && (
          <button
            id="select-all-shortcut-btn"
            className="filter-btn"
            onClick={toggleSelectAll}
            style={{ marginLeft: 'auto', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}
          >
            ☑️ Vybrat vše
          </button>
        )}
      </div>

      {loading ? (
        <div className="empty-state"><div className="empty-text">loading...</div></div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-text">Žádná videa. Vlož YouTube URL výše.</div>
        </div>
      ) : (
        <div className="video-grid" id="video-grid">
          {videos.map(v => (
            <VideoCard
              key={v.id}
              video={v}
              isSelected={selectedIds.has(v.id)}
              onToggleSelect={toggleSelectOne}
              onSummarize={handleSummarize}
              onStatusChange={handleStatusChange}
              onClick={setSelectedVideo}
              isLoading={summarizingId === v.id}
            />
          ))}
        </div>
      )}

      <div className="app-footer">YT_BRAIN · Neon + Next.js + Claude Haiku · {new Date().getFullYear()}</div>
    </div>
  )
}
