"use client";

import { useEffect, useRef, useState, useCallback } from "react";

type BriefData = {
  date: string;
  text: string;
  stats: { high: number; medium: number; low: number; total: number };
  high: VideoItem[];
  medium: VideoItem[];
};

type VideoItem = {
  title: string;
  channel: string;
  url: string;
  summary: string;
  action: string;
  tags: string;
};

export default function BriefPage() {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>("latest");
  const [speaking, setSpeaking] = useState(false);
  const [error, setError] = useState("");

  const loadBrief = useCallback((dateKey: string) => {
    const url = dateKey === "latest" ? "/briefs/latest.json" : `/briefs/${dateKey}.json`;
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error("404"); return r.json(); })
      .then((data) => setBrief(data))
      .catch(() => setError("Brief pro toto datum není k dispozici."));
  }, []);

  useEffect(() => {
    loadBrief("latest");
    fetch("/briefs/index.json")
      .then((r) => r.json())
      .then((list: string[]) => setHistory(list))
      .catch(() => {});
  }, [loadBrief]);

  const speak = useCallback(() => {
    if (!brief) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(brief.text);
    const voices = window.speechSynthesis.getVoices();
    const czVoice = voices.find((v) => v.lang.startsWith("cs") || v.lang.startsWith("sk"));
    if (czVoice) utterance.voice = czVoice;
    utterance.rate = 0.95;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    window.speechSynthesis.speak(utterance);
    setSpeaking(true);
  }, [brief, speaking]);

  const switchDate = (d: string) => {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setSelectedDate(d);
    setError("");
    loadBrief(d);
  };

  return (
    <main style={{
      minHeight: "100dvh",
      background: "linear-gradient(160deg, #080b12 0%, #0f1623 60%, #0a1020 100%)",
      fontFamily: "'SF Pro Display', -apple-system, BlinkMacSystemFont, sans-serif",
      color: "#e2e8f0",
      paddingBottom: 60,
    }}>
      <div style={{ padding: "env(safe-area-inset-top, 20px) 20px 0" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", paddingTop: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 20 }}>🧠</span>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#3b82f6" }}>
              AIVOS Brain Brief
            </span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#f1f5f9", lineHeight: 1.15 }}>
            {brief?.date ?? "Načítám..."}
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 20px" }}>

        {brief && (
          <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
            {[
              { label: "HIGH", val: brief.stats.high, color: "#22c55e" },
              { label: "MED", val: brief.stats.medium, color: "#eab308" },
              { label: "SKIP", val: brief.stats.low, color: "#475569" },
              { label: "TOTAL", val: brief.stats.total, color: "#60a5fa" },
            ].map(({ label, val, color }) => (
              <div key={label} style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: `1px solid ${color}30`,
                borderRadius: 10, padding: "8px 0", textAlign: "center",
              }}>
                <div style={{ fontSize: 18, fontWeight: 700, color }}>{val}</div>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: "0.1em", color: "#475569" }}>{label}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: 20 }}>
          <button onClick={speak} style={{
            width: "100%", padding: "16px",
            background: speaking ? "rgba(239,68,68,0.1)" : "linear-gradient(135deg, #1d4ed8, #4f46e5)",
            border: speaking ? "1px solid #ef4444" : "none",
            borderRadius: 14, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            boxShadow: speaking ? "none" : "0 4px 24px rgba(59,130,246,0.3)",
            transition: "all 0.2s",
          }}>
            <span style={{ fontSize: 22 }}>{speaking ? "⏹" : "▶"}</span>
            <span style={{ fontSize: 15, fontWeight: 600, color: "#fff" }}>
              {speaking ? "Zastavit" : "Přehrát brief"}
            </span>
          </button>
          {speaking && (
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 12, color: "#60a5fa" }}>● Přehrávám...</div>
          )}
        </div>

        {brief && brief.high.length > 0 && (
          <section style={{ marginTop: 24 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#22c55e", marginBottom: 10 }}>
              🟢 Dnes důležité
            </div>
            {brief.high.map((v, i) => <VideoCard key={i} video={v} color="#22c55e" />)}
          </section>
        )}

        {brief && brief.medium.length > 0 && (
          <section style={{ marginTop: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#eab308", marginBottom: 10 }}>
              🟡 Zajímavé
            </div>
            {brief.medium.slice(0, 5).map((v, i) => <VideoCard key={i} video={v} color="#eab308" />)}
          </section>
        )}

        {history.length > 1 && (
          <section style={{ marginTop: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#475569", marginBottom: 10 }}>
              Historie
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {history.map((d) => (
                <button key={d} onClick={() => switchDate(d)} style={{
                  padding: "6px 12px", borderRadius: 20,
                  background: selectedDate === d ? "#1d4ed8" : "rgba(255,255,255,0.05)",
                  border: selectedDate === d ? "none" : "1px solid rgba(255,255,255,0.1)",
                  color: selectedDate === d ? "#fff" : "#94a3b8",
                  fontSize: 12, cursor: "pointer",
                }}>
                  {d}
                </button>
              ))}
            </div>
          </section>
        )}

        {error && <div style={{ marginTop: 20, color: "#ef4444", fontSize: 14 }}>{error}</div>}
      </div>
    </main>
  );
}

function VideoCard({ video, color }: { video: VideoItem; color: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{
      background: "rgba(255,255,255,0.03)",
      border: `1px solid ${color}20`,
      borderRadius: 12, padding: "12px 14px", marginBottom: 8,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <a href={video.url} target="_blank" rel="noopener noreferrer"
            style={{ color: "#e2e8f0", textDecoration: "none", fontSize: 14, fontWeight: 600, lineHeight: 1.3 }}>
            {video.title}
          </a>
          <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{video.channel}</div>
        </div>
        <button onClick={() => setOpen(!open)} style={{
          background: "none", border: "none", color: "#475569",
          cursor: "pointer", fontSize: 16, padding: "0 4px", flexShrink: 0,
        }}>
          {open ? "▲" : "▼"}
        </button>
      </div>
      {open && (
        <div style={{ marginTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 10 }}>
          <p style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, margin: "0 0 8px" }}>{video.summary}</p>
          {video.action && video.action !== "N/A" && (
            <div style={{ fontSize: 12, color: "#60a5fa", background: "rgba(59,130,246,0.08)", borderRadius: 6, padding: "6px 10px" }}>
              💡 {video.action}
            </div>
          )}
          {video.tags && <div style={{ marginTop: 8, fontSize: 11, color: "#475569" }}>{video.tags}</div>}
        </div>
      )}
    </div>
  );
}
