"""
brain/process_queue.py – AIVOS Brain Feed (Stage 2)
Triage + podcast script + edge-tts .mp3
"""

import os
import json
import re
import glob
import subprocess
import tempfile
import sys
import asyncio
from datetime import date
from pathlib import Path

import google.generativeai as genai
import edge_tts

ROOT           = Path(__file__).parent.parent
DATA_DIR       = ROOT / "data"
QUEUE_FILE     = DATA_DIR / "queue.json"
PROCESSED_FILE = DATA_DIR / "processed_videos.json"
SUMMARIES_DIR  = ROOT / "summaries"
TRANSCRIPTS_DIR = ROOT / "transcripts" / "2026"
BRIEFS_DIR     = ROOT / "public" / "briefs"

GEMINI_MODEL   = "gemini-2.0-flash"
MAX_TRANSCRIPT = 10000
TTS_VOICE      = "cs-CZ-AntoninNeural"

# ─── TRIAGE PROMPT ───────────────────────────────────────────────────────────

TRIAGE_PROMPT = """Jsi osobní knowledge kurátor pro Iva – Junior Data Engineera (Konica Minolta, od dubna 2026, Azure stack).
Ivo má neurodivergentní profil (ADHD-PI, INTJ). Chce growth v IT + AI, ne marketing obsah.

TIER 1 – skóre 9-10:
- Azure: Data Factory, Databricks, Event Hub, Service Bus, Synapse, Fabric, DP-700
- Data Engineering: Python, PySpark, SQL, ETL/ELT pipelines, dbt, Medallion architektura
- AI/LLM: RAG, embeddings, vector DB, LangChain, AI agents, LLMOps
- Claude ekosystém: Claude Code, MCP, Claude skills/plugins
- Second Brain / PKM: Notion systémy, PARA metoda, knowledge management pro tech

TIER 2 – skóre 7-8:
- AI nástroje: Cursor, Copilot, Gemini, n8n, Make/Zapier
- Python pro data/AI: pandas, FastAPI, async, OOP
- Career v IT: junior → senior, soft skills pro engineery
- Produktivita pro ADHD/neurodivergentní tech lidi
- Git, GitHub Actions, CI/CD, Docker

TIER 3 – skóre 5-6:
- Obecný AI obsah, tech news
- Cloud obecně: AWS, GCP
- JS/TS, Next.js, React
- Osobní rozvoj pro tech lidi
- Bullet journal, analogové systémy

TIER 4 – skóre 1-4:
- Business/marketing/sales bez tech
- Fitness, jóga, meditace
- Zábava, filmy, hudba
- Finance bez tech
- Geopolitika, zprávy

PRAVIDLA:
- "Claude Code" = vždy 9+
- "n8n" nebo "automation workflow" = vždy 7+
- "second brain" nebo "Notion system" = vždy 7+
- "Data with Baraa", "NetworkChuck", "Fireship", "Andrej Karpathy" = vždy 7+

Video název: {title}
Kanál: {channel}
Transkript: {transcript}

Formát odpovědi:
SCORE: [1-10]
TRIAGE: [🟢 HIGH / 🟡 MEDIUM / 🔴 LOW]
SUMMARY: [2-3 věty česky co video říká – z transkriptu, ne jen z názvu]
KEY_POINTS:
- [konkrétní věc z videa]
- [konkrétní věc z videa]
- [konkrétní věc z videa]
ACTION: [co konkrétně vyzkoušet]
TAGS: [#tag1 #tag2 #tag3]

Pro SCORE 1-4: pouze SCORE a TRIAGE."""

# ─── PODCAST SCRIPT PROMPT ───────────────────────────────────────────────────

PODCAST_PROMPT = """Jsi moderátor tech podcastu "AIVOS Brain Brief" pro Iva – Junior Data Engineera.
Napiš skript pro ranní podcast. Mluv přímo na Iva, přátelsky ale věcně. Česky.
Technické termíny anglicky. Délka: 8–15 minut čteného textu.

Struktura:
1. Úvod (5 vět): pozdrav, datum, počet videí, rychlý přehled kategorií
2. Sekce HIGH (podrobně): pro každé HIGH video:
   - Název a youtuber
   - O čem video je (2-3 věty z transkriptu)
   - Klíčové poznatky (2-3 body)
   - Co z toho Ivo může použít hned
3. Sekce MEDIUM (stručněji): pro každé MEDIUM video jen 2-3 věty + jeden tip
4. Závěr: shrnutí, motivační věta, rozloučení

Tón: jako přítel-kolega tech guy, ne robot. Říkej "ty" ne "vy".
NEPOUŽIVEJ markdown, hvězdičky, čísla sekcí ani žádné formátování – jen čistý text pro TTS.

Dnešní data:
{brief_data}"""

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default

def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def slugify(text: str) -> str:
    text = re.sub(r"[^\w\s-]", "", text.lower())
    text = re.sub(r"[\s_-]+", "-", text)
    return text[:60].strip("-")

def find_existing_transcript(video_id: str) -> str:
    """Najde existující transkript v transcripts/2026/ podle video_id."""
    if not TRANSCRIPTS_DIR.exists():
        return ""
    for md_file in TRANSCRIPTS_DIR.glob(f"*--{video_id}.md"):
        text = md_file.read_text(encoding="utf-8")
        # Extrahuj obsah pod ## Transcript
        if "## Transcript" in text:
            transcript_part = text.split("## Transcript", 1)[1].strip()
            return transcript_part[:MAX_TRANSCRIPT]
        return text[:MAX_TRANSCRIPT]
    return ""

def fetch_transcript_ytdlp(video_id: str, tmp_dir: str) -> str:
    """Fallback – stáhne titulky přes yt-dlp."""
    url = f"https://www.youtube.com/watch?v={video_id}"
    cmd = [
        "yt-dlp", "--skip-download",
        "--write-auto-subs", "--write-subs",
        "--sub-langs", "cs,sk,en",
        "--sub-format", "vtt",
        "--output", os.path.join(tmp_dir, "%(id)s.%(ext)s"),
        "--no-warnings", "--quiet",
        url
    ]
    subprocess.run(cmd, capture_output=True, timeout=60)
    for lang in ["cs", "sk", "en"]:
        files = glob.glob(os.path.join(tmp_dir, f"*.{lang}*.vtt"))
        if files:
            return _parse_vtt(files[0])
    files = glob.glob(os.path.join(tmp_dir, "*.vtt"))
    return _parse_vtt(files[0]) if files else ""

def _parse_vtt(path: str) -> str:
    with open(path, encoding="utf-8") as f:
        content = f.read()
    lines = []
    for line in content.splitlines():
        line = line.strip()
        if not line or line.startswith("WEBVTT") or line.startswith("NOTE"):
            continue
        if re.match(r"^\d{2}:\d{2}.*-->", line) or re.match(r"^\d+$", line):
            continue
        line = re.sub(r"<[^>]+>", "", line)
        if line:
            lines.append(line)
    deduped, prev = [], None
    for l in lines:
        if l != prev:
            deduped.append(l)
            prev = l
    return " ".join(deduped)[:MAX_TRANSCRIPT]

def get_transcript(video: dict) -> tuple[str, str]:
    """Vrátí (transcript, source) kde source je 'existing' nebo 'yt-dlp' nebo 'none'."""
    # 1. Zkus existující transkript
    existing = find_existing_transcript(video["video_id"])
    if existing and len(existing) > 200:
        return existing, "existing"
    # 2. Fallback na yt-dlp
    with tempfile.TemporaryDirectory() as tmp:
        transcript = fetch_transcript_ytdlp(video["video_id"], tmp)
    if transcript:
        return transcript, "yt-dlp"
    return "", "none"

HIGH_KEYWORDS = [
    "claude code", "mcp", "databricks", "azure data factory",
    "rag", "langchain", "n8n", "second brain", "data engineering",
    "python data", "pyspark", "dp-700", "fabric", "gemini", "ai",
    "azure", "llm", "vector", "embedding", "agent", "automation",
    "notion", "obsidian", "pkm", "knowledge base",
]

HIGH_CHANNELS = [
    "data with baraa", "networkchuck", "fireship", "andrej karpathy",
    "karpathy", "techwithtim", "coding with lewis",
]

def keyword_boost(title: str, channel: str) -> int | None:
    """Vrátí score 9 pokud title nebo channel obsahuje HIGH keyword. Jinak None."""
    title_lower = title.lower()
    channel_lower = channel.lower()
    if any(kw in title_lower for kw in HIGH_KEYWORDS):
        return 9
    if any(ch in channel_lower for ch in HIGH_CHANNELS):
        return 9
    return None

def triage_video(video: dict, transcript: str, model) -> dict:
    # Keyword pre-filter – přeskočí Gemini triage rozhodnutí, ale stále získá shrnutí
    forced_score = keyword_boost(video["title"], video["channel"])

    prompt = TRIAGE_PROMPT.format(
        title=video["title"],
        channel=video["channel"],
        transcript=transcript or "(transkript nedostupný – hodnoť jen z názvu a kanálu)"
    )
    try:
        text = model.generate_content(prompt).text.strip()
    except Exception as e:
        print(f"  ⚠️  Gemini error: {e}")
        result = {"score": 5, "triage": "🟡 MEDIUM", "summary": "", "key_points": [], "action": "N/A", "tags": ""}
        if forced_score:
            result["score"] = forced_score
            result["triage"] = "🟢 HIGH"
        return result

    result = _parse_triage(text)

    # Override triage pokud keyword match
    if forced_score and result["score"] < forced_score:
        result["score"] = forced_score
        result["triage"] = "🟢 HIGH"
        print(f"  ⚡ Keyword boost → 🟢 HIGH (9/10)")

    return result

def _parse_triage(text: str) -> dict:
    r = {"score": 1, "triage": "🔴 LOW", "summary": "", "key_points": [], "action": "N/A", "tags": ""}
    for line in text.splitlines():
        if line.startswith("SCORE:"):
            try: r["score"] = int(re.search(r'\d+', line).group())
            except: pass
        elif line.startswith("TRIAGE:"):
            v = line.replace("TRIAGE:", "").strip()
            r["triage"] = "🟢 HIGH" if "🟢" in v else ("🟡 MEDIUM" if "🟡" in v else "🔴 LOW")
        elif line.startswith("SUMMARY:"):
            r["summary"] = line.replace("SUMMARY:", "").strip()
        elif line.startswith("ACTION:"):
            r["action"] = line.replace("ACTION:", "").strip()
        elif line.startswith("TAGS:"):
            r["tags"] = line.replace("TAGS:", "").strip()
        elif line.startswith("- ") and r["summary"]:
            r["key_points"].append(line[2:].strip())
    return r

def save_summary(video: dict, analysis: dict, today: str, transcript_source: str) -> str:
    SUMMARIES_DIR.mkdir(parents=True, exist_ok=True)
    slug = slugify(video["title"])
    filepath = SUMMARIES_DIR / f"{today}-{slug}.md"
    kp = "\n".join(f"- {p}" for p in analysis["key_points"]) or "- (viz video)"
    content = f"""---
title: "{video['title']}"
channel: "{video['channel']}"
source: "{video['url']}"
date: {today}
score: {analysis['score']}
triage: "{analysis['triage']}"
tags: {analysis['tags']}
transcript_source: "{transcript_source}"
type: youtube-summary
---

# {video['title']}

> {analysis['triage']} | Score: {analysis['score']}/10 | [{video['channel']}]({video['url']}) | {today}

## Shrnutí
{analysis['summary']}

## Klíčové body
{kp}

## Akční krok
{analysis['action']}
"""
    filepath.write_text(content, encoding="utf-8")
    return str(filepath)

def generate_podcast_script(results: list, today: str, model) -> str:
    """Gemini napíše podcast skript moderátor stylem."""
    high   = [v for v in results if "🟢" in v["triage"]]
    medium = [v for v in results if "🟡" in v["triage"]]
    low_n  = sum(1 for v in results if "🔴" in v["triage"])

    brief_data = f"Datum: {today}\nCelkem videí: {len(results)}\nHIGH: {len(high)}, MEDIUM: {len(medium)}, PŘESKOČENO: {low_n}\n\n"

    if high:
        brief_data += "=== HIGH RELEVANCE VIDEA ===\n"
        for v in high:
            brief_data += f"\nVideo: {v['title']}\nYouTuber: {v['channel']}\nSkóre: {v.get('score','?')}/10\nShrnutí: {v.get('summary','')}\nKlíčové body: {', '.join(v.get('key_points',[]))}\nAkční krok: {v.get('action','')}\n"

    if medium:
        brief_data += "\n=== MEDIUM RELEVANCE VIDEA ===\n"
        for v in medium[:5]:
            brief_data += f"\nVideo: {v['title']}\nYouTuber: {v['channel']}\nSkóre: {v.get('score','?')}/10\nShrnutí: {v.get('summary','')}\nAkční krok: {v.get('action','')}\n"

    if not high and not medium:
        return f"Dobré ráno Ivo! Dnes {today} žádná nová relevantní videa v queue. Přidej něco do AIVOS Queue playlistu a zítra si to poslechnem. Hodně štěstí v práci!"

    prompt = PODCAST_PROMPT.format(brief_data=brief_data)
    try:
        script = model.generate_content(prompt).text.strip()
        return script
    except Exception as e:
        print(f"  ⚠️  Podcast script error: {e}")
        # Fallback – jednoduchý skript
        lines = [f"Dobré ráno Ivo! Dnes {today} mám pro tebe {len(high)} důležitých a {len(medium)} zajímavých videí."]
        for v in high:
            lines.append(f"Video {v['title']} od {v['channel']}. {v.get('summary','')} Akční krok: {v.get('action','')}.")
        for v in medium[:3]:
            lines.append(f"Také {v['title']}. {v.get('summary','')}.")
        lines.append("To je vše pro dnešní ráno. Hodně štěstí!")
        return " ".join(lines)

async def text_to_mp3(text: str, output_path: str):
    """edge-tts: text → .mp3"""
    communicate = edge_tts.Communicate(text, TTS_VOICE)
    await communicate.save(output_path)

def save_brief(results: list, today: str, podcast_script: str):
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)

    high = sorted(
        [{"title": v["title"], "channel": v["channel"], "url": v["url"],
          "summary": v.get("summary",""), "action": v.get("action","N/A"),
          "tags": v.get("tags",""), "score": v.get("score", 0),
          "key_points": v.get("key_points",[])}
         for v in results if "🟢" in v["triage"]],
        key=lambda x: x["score"], reverse=True)
    medium = sorted(
        [{"title": v["title"], "channel": v["channel"], "url": v["url"],
          "summary": v.get("summary",""), "action": v.get("action","N/A"),
          "tags": v.get("tags",""), "score": v.get("score", 0),
          "key_points": v.get("key_points",[])}
         for v in results if "🟡" in v["triage"]],
        key=lambda x: x["score"], reverse=True)
    low_n = sum(1 for v in results if "🔴" in v["triage"])

    brief_data = {
        "date": today,
        "text": podcast_script,
        "stats": {"high": len(high), "medium": len(medium), "low": low_n, "total": len(results)},
        "high": high,
        "medium": medium,
        "has_audio": True
    }

    (BRIEFS_DIR / f"{today}.json").write_text(json.dumps(brief_data, ensure_ascii=False, indent=2), encoding="utf-8")
    (BRIEFS_DIR / "latest.json").write_text(json.dumps(brief_data, ensure_ascii=False, indent=2), encoding="utf-8")

    index_path = BRIEFS_DIR / "index.json"
    index = load_json(index_path, [])
    if today not in index:
        index.insert(0, today)
    save_json(index_path, index)
    print(f"📄 Brief JSON uložen.")

# ─── MAIN ────────────────────────────────────────────────────────────────────

def main():
    today = date.today().isoformat()
    print(f"\n🧠 AIVOS process_queue | {today}\n")

    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY není nastaven.")
        sys.exit(1)

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(GEMINI_MODEL)

    queue     = load_json(QUEUE_FILE, [])
    processed = set(load_json(PROCESSED_FILE, []))
    new_videos = [v for v in queue if v["video_id"] not in processed]
    print(f"📥 Queue: {len(queue)} celkem | {len(new_videos)} nových\n")

    if not new_videos:
        print("✅ Nic nového.")
        script = f"Dobré ráno Ivo! Dnes {today} žádná nová videa v AIVOS Queue. Hodně štěstí v práci!"
        save_brief([], today, script)
        asyncio.run(text_to_mp3(script, str(BRIEFS_DIR / "latest_brief.mp3")))
        return

    results = []
    for i, video in enumerate(new_videos, 1):
        print(f"[{i}/{len(new_videos)}] {video['title'][:65]}")

        transcript, source = get_transcript(video)
        print(f"  📄 Transkript: {source} ({len(transcript)} znaků)")

        analysis = triage_video(video, transcript, model)
        print(f"  {analysis['triage']} ({analysis.get('score','?')}/10)")

        if "🔴" not in analysis["triage"]:
            save_summary(video, analysis, today, source)

        processed.add(video["video_id"])
        results.append({**video, **analysis})

    save_json(PROCESSED_FILE, list(processed))
    save_json(QUEUE_FILE, [])

    # Podcast skript
    print("\n🎙️  Generuji podcast skript...")
    podcast_script = generate_podcast_script(results, today, model)
    print(f"   Délka skriptu: {len(podcast_script)} znaků (~{len(podcast_script)//15} sekund)")

    # TTS → .mp3
    print("🔊 Převádím na audio...")
    mp3_path = str(BRIEFS_DIR / "latest_brief.mp3")
    dated_mp3 = str(BRIEFS_DIR / f"{today}_brief.mp3")
    asyncio.run(text_to_mp3(podcast_script, mp3_path))
    asyncio.run(text_to_mp3(podcast_script, dated_mp3))
    print(f"   ✅ Audio: {mp3_path}")

    save_brief(results, today, podcast_script)

    h = sum(1 for r in results if "🟢" in r["triage"])
    m = sum(1 for r in results if "🟡" in r["triage"])
    l = sum(1 for r in results if "🔴" in r["triage"])
    print(f"\n📊 🟢 {h} | 🟡 {m} | 🔴 {l}")
    print("🏁 Hotovo.\n")

if __name__ == "__main__":
    main()
