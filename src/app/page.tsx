'use client'

import { useState, useEffect, useCallback } from 'react'

type Video = {
  id: number
  video_id: string
  title: string | null
  channel: string | null
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

function VideoCard({ video, onSummarize, onStatusChange, onClick, isLoading }: {
  video: Video
  onSummarize: (id: number) => void
  onStatusChange: (id: number, status: string) => void
  onClick: (v: Video) => void
  isLoading: boolean
}) {
  return (
    <div className={`video-card${video.status === 'skip' ? ' skipped' : ''}`} onClick={() => onClick(video)}>
      <div className="thumb-wrap">
        <img src={thumb(video.video_id)} alt="" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
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
        {video.summary && <div className="card-summary">{video.summary}</div>}
        {video.tags && video.tags.length > 0 && (
          <div className="card-tags">{video.tags.slice(0, 3).map(t => <span key={t} className="tag">{t}</span>)}</div>
        )}
        {video.insights?.para_location && <div className="card-para">→ {video.insights.para_location}</div>}
        <div className="card-actions" onClick={e => e.stopPropagation()}>
          <select
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
            ? <button className="summarize-btn" disabled={isLoading} onClick={() => onSummarize(video.id)}>{isLoading ? '...' : '⚡ Summarize'}</button>
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
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-thumb"><img src={thumb(video.video_id)} alt="" /></div>
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
            <p style={{ fontSize: '0.875rem', color: '#6b6b8a' }}>Klikni na ⚡ Summarize pro zpracování (Claude Haiku ~$0.001).</p>
          )}
          <a href={`https://www.youtube.com/watch?v=${video.video_id}`} target="_blank" rel="noopener noreferrer" className="yt-link">
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
      notify('ok', data.cached ? 'Už v databázi ✓' : 'Transcript stažen ✓')
      setUrlInput('')
      loadVideos()
    } catch (e) { notify('err', e instanceof Error ? e.message : 'Chyba') } finally { setFetchingUrl(false) }
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

      <header style={{ marginBottom: '2rem' }}>
        <div>
          <span className="app-title">YT_BRAIN</span>
          <span className="app-version">v0.1 — second brain pipeline</span>
        </div>
        <div className="app-subtitle">Stáhni transcript → ulož → summarizuj on-demand → exportuj do Notion</div>
      </header>

      <div className="stats-grid">
        {[
          { label: 'celkem',     value: stats.total,     color: '#9d8fff' },
          { label: 'zpracováno', value: stats.processed,  color: '#22c55e' },
          { label: '🔥 high',   value: stats.high,       color: '#ef4444' },
          { label: '✅ done',   value: stats.done,       color: '#6b6b8a' },
        ].map(({ label, value, color }) => (
          <div key={label} className="stat-card">
            <div className="stat-value" style={{ color }}>{value}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="url-row">
        <input
          className="url-input"
          type="text"
          value={urlInput}
          onChange={e => setUrlInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleFetch()}
          placeholder="https://youtube.com/watch?v=..."
        />
        <button className="fetch-btn" onClick={handleFetch} disabled={fetchingUrl || !urlInput.trim()}>
          {fetchingUrl ? '↓ ...' : '↓ Fetch'}
        </button>
      </div>

      <div className="filter-row">
        <div className="filter-group">
          {['all', 'to_watch', 'in_progress', 'done', 'skip'].map(s => (
            <button key={s} className={`filter-btn${filterStatus === s ? ' active' : ''}`} onClick={() => setFilterStatus(s)}>
              {s === 'all' ? 'all' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>
        <div className="filter-group">
          {['all', 'high', 'medium', 'low'].map(p => (
            <button key={p} className={`filter-btn${filterPriority === p ? ' active' : ''}`} onClick={() => setFilterPriority(p)}>
              {p === 'all' ? 'all' : PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="empty-state"><div className="empty-text">loading...</div></div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">📭</div>
          <div className="empty-text">Žádná videa. Vlož YouTube URL výše.</div>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map(v => (
            <VideoCard
              key={v.id}
              video={v}
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
