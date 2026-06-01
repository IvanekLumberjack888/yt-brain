// Přidej tuto BriefView funkci do app/page.tsx v AIVOS
// Nahraď stávající BriefView funkci touto

function BriefView() {
  const [brief, setBrief] = useState<BriefData | null>(null);
  const [history, setHistory] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("latest");
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement>(null);

  const loadBrief = useCallback((dateKey: string) => {
    const url = dateKey === "latest" ? "/briefs/latest.json" : `/briefs/${dateKey}.json`;
    fetch(url)
      .then(r => { if (!r.ok) throw new Error("404"); return r.json(); })
      .then(data => { setBrief(data); setError(""); })
      .catch(() => setError("Brief pro toto datum není k dispozici."));
  }, []);

  useEffect(() => {
    loadBrief("latest");
    fetch("/briefs/index.json").then(r => r.json()).then(setHistory).catch(() => {});
  }, [loadBrief]);

  // Audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => setProgress(audio.currentTime);
    const onDur  = () => setDuration(audio.duration);
    const onEnd  = () => setPlaying(false);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDur);
    audio.addEventListener("ended", onEnd);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDur);
      audio.removeEventListener("ended", onEnd);
    };
  }, [brief]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) { audio.pause(); setPlaying(false); }
    else { audio.play(); setPlaying(true); }
  };

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Number(e.target.value);
    setProgress(Number(e.target.value));
  };

  const fmt = (s: number) => {
    if (!s || isNaN(s)) return "0:00";
    return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  };

  const switchDate = (d: string) => {
    const audio = audioRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
    setPlaying(false); setProgress(0);
    setSelectedDate(d); loadBrief(d);
  };

  // Audio src – latest_brief.mp3 nebo dated
  const audioSrc = selectedDate === "latest"
    ? "/briefs/latest_brief.mp3"
    : `/briefs/${selectedDate}_brief.mp3`;

  return (
    <div style={{ padding: "2rem", maxWidth: 900, margin: "0 auto" }}>

      {/* Stats */}
      {brief && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 20 }}>
          {[
            { label: "HIGH",  val: brief.stats.high,   color: "#10b981" },
            { label: "MED",   val: brief.stats.medium, color: "#f59e0b" },
            { label: "SKIP",  val: brief.stats.low,    color: "#4b5563" },
            { label: "TOTAL", val: brief.stats.total,  color: "#6ee7b7" },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ ...cardStyle, padding: "14px 0", textAlign: "center" }}>
              <div style={{ color, fontSize: 22, fontFamily: monoFont, fontWeight: 700 }}>{val}</div>
              <div style={{ color: "#4b5563", fontSize: 9, fontFamily: monoFont, letterSpacing: 1, marginTop: 2 }}>{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Player */}
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <audio ref={audioRef} src={audioSrc} preload="metadata" />

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div>
            <div style={{ color: "#4b5563", fontSize: 10, fontFamily: monoFont, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 2 }}>Brain Brief Podcast</div>
            <div style={{ color: "#f8fff8", fontSize: 16, fontFamily: monoFont, fontWeight: 700 }}>{brief?.date ?? "Načítám..."}</div>
          </div>
          <button onClick={togglePlay} style={{
            width: 52, height: 52, borderRadius: "50%",
            background: playing ? "rgba(16,185,129,0.15)" : "rgba(16,185,129,0.9)",
            border: `1px solid ${playing ? "#10b981" : "transparent"}`,
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 20, color: playing ? "#10b981" : "#0f1410",
            transition: "all 0.2s",
          }}>
            {playing ? "⏸" : "▶"}
          </button>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 6 }}>
          <input type="range" min={0} max={duration || 100} value={progress} onChange={seek}
            style={{
              width: "100%", appearance: "none" as const, height: 3, borderRadius: 2, outline: "none", cursor: "pointer",
              background: `linear-gradient(to right, #10b981 ${(progress / (duration || 1)) * 100}%, rgba(16,185,129,0.15) 0%)`,
            }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, fontFamily: monoFont, color: "#4b5563" }}>
          <span>{fmt(progress)}</span>
          <span>{fmt(duration)}</span>
        </div>
      </div>

      {/* HIGH videos */}
      {brief && brief.high.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ color: "#10b981", fontSize: 10, fontFamily: monoFont, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 12 }}>● High relevance</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {brief.high.map((v, i) => <BriefVideoCard key={i} video={v} color="#10b981" />)}
          </div>
        </div>
      )}

      {/* MEDIUM videos */}
      {brief && brief.medium.length > 0 && (
        <div style={{ ...cardStyle, marginBottom: 16 }}>
          <div style={{ color: "#f59e0b", fontSize: 10, fontFamily: monoFont, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 12 }}>● Medium</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {brief.medium.slice(0, 8).map((v, i) => <BriefVideoCard key={i} video={v} color="#f59e0b" />)}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 1 && (
        <div style={cardStyle}>
          <div style={{ color: "#4b5563", fontSize: 10, fontFamily: monoFont, letterSpacing: 2, textTransform: "uppercase" as const, marginBottom: 12 }}>Historie</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {history.map(d => (
              <button key={d} onClick={() => switchDate(d)} style={{
                padding: "4px 12px", borderRadius: 20,
                background: selectedDate === d ? "rgba(16,185,129,0.2)" : "transparent",
                border: `1px solid ${selectedDate === d ? "#10b981" : "rgba(16,185,129,0.2)"}`,
                color: selectedDate === d ? "#10b981" : "#6b7280",
                fontSize: 11, fontFamily: monoFont, cursor: "pointer",
              }}>{d}</button>
            ))}
          </div>
        </div>
      )}

      {error && <div style={{ color: "#ef4444", fontSize: 13, marginTop: 16 }}>{error}</div>}
    </div>
  );
}
