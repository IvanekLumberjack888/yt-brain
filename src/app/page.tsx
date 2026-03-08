'use client'

import { useState, useEffect, useCallback } from 'react'
import clsx from 'clsx'

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
const STATUS_LABEL: Record<string, string>   = { to_watch: '🔴 To Watch', in_progress: '🟡 In Progress', done: '✅ Done', skip: '⏭️ Skip' }
const PRIORITY_COLOR: Record<string, string> = {
  high:   'bg-red-900/30 text-red-300 border-red-800/50',
  medium: 'bg-yellow-900/30 text-yellow-300 border-yellow-800/50',
  low:    'bg-slate-800/50 text-slate-400 border-slate-700/50',
}
const STATUS_COLOR: Record<string, string> = {
  to_watch:    'bg-red-900/20 text-red-400',
  in_progress: 'bg-yellow-900/20 text-yellow-400',
  done:        'bg-green-900/20 text-green-400',
  skip:        'bg-slate-800/40 text-slate-500',
}
const SCORE_COLOR = (s: number) => s >= 8 ? '#22c55e' : s >= 5 ? '#f59e0b' : '#6b6b8a'
function thumbnailUrl(videoId: string) { return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` }

function TagBadge({ tag }: { tag: string }) {
  return <span style={{ fontFamily: 'Space Mono, monospace', fontSize: '0.7rem' }} className="px-2 py-0.5 rounded bg-indigo-900/40 text-indigo-300 border border-indigo-800/40">{tag}</span>
}

function ScoreDot({ score }: { score: number }) {
  return <span className="inline-flex items-center gap-1 text-xs font-mono" style={{ color: SCORE_COLOR(score) }}><span className="inline-block w-2 h-2 rounded-full" style={{ background: SCORE_COLOR(score) }} />{score}/10</span>
}

function VideoCard({ video, onSummarize, onStatusChange, onClick, isLoading }: {
  video: Video; onSummarize: (id: number) => void; onStatusChange: (id: number, status: string) => void; onClick: (video: Video) => void; isLoading: boolean
}) {
  return (
    <div className={clsx('group relative rounded-xl border transition-all duration-200 cursor-pointer overflow-hidden', video.status === 'skip' ? 'opacity-40' : 'opacity-100', 'border-[#1e1e2e] hover:border-[#3a3a5e] bg-[#111118]')} style={{ boxShadow: '0 2px 16px rgba(0,0,0,0.4)' }} onClick={() => onClick(video)}>
      <div className="relative w-full aspect-video bg-[#0a0a0f] overflow-hidden">
        <img src={thumbnailUrl(video.video_id)} alt={video.title ?? 'Video thumbnail'} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
        <span className={clsx('absolute top-2 left-2 text-xs px-2 py-0.5 rounded-md border font-mono', PRIORITY_COLOR[video.priority])}>{PRIORITY_LABEL[video.priority]}</span>
        {video.insights?.relevance_score && <span className="absolute top-2 right-2 bg-black/70 backdrop-blur px-2 py-0.5 rounded-md"><ScoreDot score={video.insights.relevance_score} /></span>}
      </div>
      <div className="p-3 flex flex-col gap-2">
        <div>
          <p className="text-sm font-medium leading-snug line-clamp-2" style={{ color: '#e8e8f0' }}>{video.title ?? 'Loading title...'}</p>
          {video.channel && <p className="text-xs mt-0.5" style={{ color: '#6b6b8a' }}>{video.channel}</p>}
        </div>
        {video.summary && <p className="text-xs leading-relaxed line-clamp-3" style={{ color: '#9090b0' }}>{video.summary}</p>}
        {video.tags && video.tags.length > 0 && <div className="flex flex-wrap gap-1">{video.tags.slice(0, 3).map((t) => <TagBadge key={t} tag={t} />)}</div>}
        {video.insights?.para_location && <p className="text-xs font-mono" style={{ color: '#7c6af7' }}>→ {video.insights.para_location}</p>}
        <div className="flex items-center justify-between gap-2 pt-1 border-t" style={{ borderColor: '#1e1e2e' }} onClick={(e) => e.stopPropagation()}>
          <select value={video.status} onChange={(e) => onStatusChange(video.id, e.target.value)} className={clsx('text-xs rounded px-2 py-0.5 border-0 outline-none cursor-pointer', STATUS_COLOR[video.status])} style={{ background: 'transparent', fontFamily: 'DM Sans, sans-serif' }}>
            <option value="to_watch">🔴 To Watch</option>
            <option value="in_progress">🟡 In Progress</option>
            <option value="done">✅ Done</option>
            <option value="skip">⏭️ Skip</option>
          </select>
          {!video.summary && <button onClick={() => onSummarize(video.id)} disabled={isLoading} className={clsx('text-xs px-3 py-1 rounded-lg font-mono transition-all', isLoading ? 'bg-slate-800 text-slate-500 cursor-not-allowed' : 'bg-indigo-900/60 text-indigo-300 hover:bg-indigo-800/60 border border-indigo-800/50')}>{isLoading ? '...' : '⚡ Summarize'}</button>}
          {video.summary && <span className="text-xs font-mono" style={{ color: '#22c55e' }}>✓ processed</span>}
        </div>
      </div>
    </div>
  )
}

function DetailPanel({ video, onClose }: { video: Video; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }} onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl border" style={{ background: '#111118', borderColor: '#2a2a3e' }} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 p-4 border-b" style={{ background: '#111118', borderColor: '#1e1e2e' }}>
          <div>
            <h2 className="text-base font-medium leading-snug" style={{ color: '#e8e8f0', fontFamily: 'DM Sans' }}>{video.title}</h2>
            {video.channel && <p className="text-xs mt-0.5" style={{ color: '#6b6b8a' }}>{video.channel}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 text-lg leading-none" style={{ color: '#6b6b8a' }}>✕</button>
        </div>
        <div className="w-full aspect-video bg-black overflow-hidden"><img src={thumbnailUrl(video.video_id)} alt="" className="w-full h-full object-cover" /></div>
        <div className="p-4 flex flex-col gap-4">
          {video.insights ? (
            <>
              <section><h3 className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: '#7c6af7' }}>TL;DR</h3><p className="text-sm leading-relaxed" style={{ color: '#c8c8e0' }}>{video.insights.tldr}</p></section>
              {video.insights.key_points?.length ? <section><h3 className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: '#7c6af7' }}>Key Insights</h3><ul className="flex flex-col gap-1.5">{video.insights.key_points.map((p, i) => <li key={i} className="flex gap-2 text-sm" style={{ color: '#c8c8e0' }}><span style={{ color: '#7c6af7', flexShrink: 0 }}>▸</span>{p}</li>)}</ul></section> : null}
              {video.insights.action_items?.length ? <section><h3 className="text-xs font-mono uppercase tracking-widest mb-2" style={{ color: '#22c55e' }}>Action Items</h3><ul className="flex flex-col gap-1.5">{video.insights.action_items.map((a, i) => <li key={i} className="flex gap-2 text-sm" style={{ color: '#c8c8e0' }}><span style={{ color: '#22c55e', flexShrink: 0 }}>→</span>{a}</li>)}</ul></section> : null}
              <div className="flex flex-wrap items-center gap-3 pt-2 border-t" style={{ borderColor: '#1e1e2e' }}>
                {video.insights.relevance_score && <ScoreDot score={video.insights.relevance_score} />}
                {video.insights.para_location && <span className="text-xs font-mono" style={{ color: '#7c6af7' }}>→ {video.insights.para_location}</span>}
                {video.tags?.map((t) => <TagBadge key={t} tag={t} />)}
              </div>
            </>
          ) : <p className="text-sm" style={{ color: '#6b6b8a' }}>Klikni na ⚡ Summarize pro zpracování pomocí AI (Claude Haiku ~$0.001).</p>}
          <a href={`https://www.youtube.com/watch?v=${video.video_id}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm font-mono rounded-lg px-3 py-2 transition-all" style={{ background: '#1e1e2e', color: '#9d8fff', border: '1px solid #2a2a3e' }}>▶ Otevřít na YouTube ↗</a>
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
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [filterPriority, setFilterPriority] = useState<string>('all')
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  const notify = (type: 'ok' | 'err', text: string) => { setMessage({ type, text }); setTimeout(() => setMessage(null), 3500) }

  const loadVideos = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterStatus !== 'all') params.set('status', filterStatus)
      if (filterPriority !== 'all') params.set('priority', filterPriority)
      const res = await fetch(`/api/videos?${params}`)
      const data = await res.json()
      setVideos(data.videos ?? [])
    } catch { notify('err', 'Chyba při načítání videí') } finally { setLoading(false) }
  }, [filterStatus, filterPriority])

  useEffect(() => { loadVideos() }, [loadVideos])

  const handleFetchUrl = async () => {
    if (!urlInput.trim()) return
    setFetchingUrl(true)
    try {
      const res = await fetch('/api/transcript', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: urlInput.trim() }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      notify('ok', data.cached ? 'Video už je v databázi ✓' : 'Transcript stažen a uložen ✓')
      setUrlInput('')
      loadVideos()
    } catch (err) { notify('err', err instanceof Error ? err.message : 'Neznámá chyba') } finally { setFetchingUrl(false) }
  }

  const handleSummarize = async (id: number) => {
    setSummarizingId(id)
    try {
      const res = await fetch('/api/summarize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ videoId: id }) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      notify('ok', data.cached ? 'Shrnutí načteno z cache ✓' : 'AI zpracování dokončeno ✓')
      loadVideos()
    } catch (err) { notify('err', err instanceof Error ? err.message : 'AI chyba') } finally { setSummarizingId(null) }
  }

  const handleStatusChange = async (id: number, status: string) => {
    await fetch('/api/videos', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) })
    setVideos((prev) => prev.map((v) => v.id === id ? { ...v, status: status as Video['status'] } : v))
  }

  const stats = { total: videos.length, processed: videos.filter((v) => v.summary).length, high: videos.filter((v) => v.priority === 'high' && v.status === 'to_watch').length, done: videos.filter((v) => v.status === 'done').length }

  return (
    <div className="relative min-h-screen" style={{ zIndex: 1 }}>
      {message && <div className="fixed top-4 right-4 z-50 px-4 py-2 rounded-lg text-sm font-mono border transition-all" style={{ background: message.type === 'ok' ? '#052e16' : '#450a0a', color: message.type === 'ok' ? '#4ade80' : '#f87171', borderColor: message.type === 'ok' ? '#166534' : '#7f1d1d', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' }}>{message.text}</div>}
      {selectedVideo && <DetailPanel video={selectedVideo} onClose={() => setSelectedVideo(null)} />}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <header className="mb-8">
          <div className="flex items-baseline gap-3 mb-1">
            <h1 className="text-2xl font-bold tracking-tight" style={{ fontFamily: 'Space Mono', color: '#9d8fff' }}>YT_BRAIN</h1>
            <span className="text-xs font-mono" style={{ color: '#3a3a5e' }}>v0.1 — second brain pipeline</span>
          </div>
          <p className="text-sm" style={{ color: '#6b6b8a' }}>Stáhni transcript → ulož → summarizuj on-demand → exportuj do Notion</p>
        </header>
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[{ label: 'celkem', value: stats.total, color: '#9d8fff' }, { label: 'zpracováno', value: stats.processed, color: '#22c55e' }, { label: '🔥 high', value: stats.high, color: '#ef4444' }, { label: '✅ done', value: stats.done, color: '#6b6b8a' }].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl p-3 border text-center" style={{ background: '#111118', borderColor: '#1e1e2e' }}>
              <div className="text-2xl font-mono font-bold" style={{ color }}>{value}</div>
              <div className="text-xs mt-0.5" style={{ color: '#6b6b8a', fontFamily: 'Space Mono' }}>{label}</div>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mb-6">
          <input type="text" value={urlInput} onChange={(e) => setUrlInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleFetchUrl()} placeholder="https://youtube.com/watch?v=..." className="flex-1 rounded-xl px-4 py-2.5 text-sm font-mono border outline-none transition-all" style={{ background: '#111118', borderColor: '#2a2a3e', color: '#e8e8f0' }} />
          <button onClick={handleFetchUrl} disabled={fetchingUrl || !urlInput.trim()} className="px-5 py-2.5 rounded-xl text-sm font-mono font-bold transition-all disabled:opacity-40" style={{ background: fetchingUrl ? '#1e1e2e' : '#4c3db0', color: '#e8e8f0', border: '1px solid #5a4acc' }}>{fetchingUrl ? '↓ ...' : '↓ Fetch'}</button>
        </div>
        <div className="flex flex-wrap gap-2 mb-6">
          <div className="flex gap-1 rounded-lg p-1" style={{ background: '#111118', border: '1px solid #1e1e2e' }}>
            {['all', 'to_watch', 'in_progress', 'done', 'skip'].map((s) => <button key={s} onClick={() => setFilterStatus(s)} className="text-xs px-3 py-1 rounded-md transition-all font-mono" style={{ background: filterStatus === s ? '#2a2a3e' : 'transparent', color: filterStatus === s ? '#9d8fff' : '#6b6b8a' }}>{s === 'all' ? 'all' : STATUS_LABEL[s]}</button>)}
          </div>
          <div className="flex gap-1 rounded-lg p-1" style={{ background: '#111118', border: '1px solid #1e1e2e' }}>
            {['all', 'high', 'medium', 'low'].map((p) => <button key={p} onClick={() => setFilterPriority(p)} className="text-xs px-3 py-1 rounded-md transition-all font-mono" style={{ background: filterPriority === p ? '#2a2a3e' : 'transparent', color: filterPriority === p ? '#9d8fff' : '#6b6b8a' }}>{p === 'all' ? 'all' : PRIORITY_LABEL[p]}</button>)}
          </div>
        </div>
        {loading ? <div className="flex items-center justify-center py-20"><div className="text-sm font-mono" style={{ color: '#6b6b8a' }}>loading...</div></div>
          : videos.length === 0 ? <div className="flex flex-col items-center justify-center py-20 gap-3"><div className="text-4xl">📭</div><div className="text-sm font-mono" style={{ color: '#6b6b8a' }}>Žádná videa. Vlož YouTube URL výše.</div></div>
          : <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{videos.map((video) => <VideoCard key={video.id} video={video} onSummarize={handleSummarize} onStatusChange={handleStatusChange} onClick={setSelectedVideo} isLoading={summarizingId === video.id} />)}</div>}
        <footer className="mt-12 text-center text-xs font-mono" style={{ color: '#2a2a3e' }}>YT_BRAIN · Neon + Next.js + Claude Haiku · {new Date().getFullYear()}</footer>
      </div>
    </div>
  )
}
