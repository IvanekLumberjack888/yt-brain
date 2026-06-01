"""
brain/process_queue.py – AIVOS Brain Feed (Stage 2)
"""

import os
import json
import re
import glob
import subprocess
import tempfile
import sys
from datetime import date
from pathlib import Path

import google.generativeai as genai

ROOT           = Path(__file__).parent.parent
DATA_DIR       = ROOT / "data"
QUEUE_FILE     = DATA_DIR / "queue.json"
PROCESSED_FILE = DATA_DIR / "processed_videos.json"
SUMMARIES_DIR  = ROOT / "summaries"
BRIEFS_DIR     = ROOT / "public" / "briefs"

GEMINI_MODEL   = "gemini-2.0-flash"
MAX_TRANSCRIPT = 8000

TRIAGE_PROMPT = """Jsi osobní knowledge kurátor pro Iva – Junior Data Engineera (Konica Minolta, od dubna 2026, Azure stack).
Ivo má neurodivergentní profil (ADHD-PI, INTJ). Chce growth v IT + AI, ne marketing obsah.

Ivo aktivně sleduje a studuje tato témata (z jeho Notion roadmap + YouTube playlistů):

TIER 1 – Nejvyšší priorita (skóre 9-10):
- Azure: Data Factory, Databricks, Event Hub, Service Bus, Synapse, Fabric, DP-700
- Data Engineering: Python, PySpark, SQL, ETL/ELT pipelines, dbt, Medallion architektura
- AI/LLM systémy: RAG, embeddings, vector DB, LangChain, AI agents, LLMOps
- Claude ekosystém: Claude Code, MCP (Model Context Protocol), Claude skills/plugins
- Second Brain / PKM: Notion systémy, Obsidian, PARA metoda, knowledge management pro tech

TIER 2 – Vysoká priorita (skóre 7-8):
- AI nástroje obecně: Cursor, Copilot, Gemini, n8n workflow automation, Make/Zapier
- Python pro data/AI: pandas, numpy, FastAPI, async, OOP patterns
- Career v IT: junior → senior growth, soft skills pro engineery, job market v AI
- Produktivita pro ADHD/neurodivergentní tech lidi: focus systémy, energy management
- Git, GitHub Actions, CI/CD, Docker základy

TIER 3 – Zajímavé (skóre 5-6):
- Obecný AI obsah: tech news, AI launches, industry trendy
- Cloud obecně: AWS, GCP
- Programování: JS/TS, Next.js, React
- Osobní rozvoj pro tech lidi: komunikace, leadership, mindset
- Bullet journal, analogové systémy produktivity

TIER 4 – Nerelevantní (skóre 1-4):
- Čistý business/marketing/sales bez tech obsahu
- Fitness, jóga, meditace, zdravá strava
- Zábava, filmy, hudba, lifestyle
- Finance/investice bez tech kontextu
- Geopolitika, zprávy, politika

PRAVIDLA (vždy platí):
- "Claude Code" v názvu = VŽDY score 9+
- "n8n" nebo "automation workflow" = VŽDY score 7+
- "second brain" nebo "Notion system" = VŽDY score 7+
- "Data with Baraa", "NetworkChuck", "Fireship", "Andrej Karpathy" = VŽDY score 7+
- "career switch IT", "junior developer", "new job tech" = score 7+
- Pokud název/kanál jasně napovídá – dej benefit of the doubt, nebuď přísný

Video název: {title}
Kanál: {channel}
Transkript: {transcript}

Odpovídej PŘESNĚ v tomto formátu:
SCORE: [číslo 1-10]
TRIAGE: [🟢 HIGH pokud score 7+, 🟡 MEDIUM pokud 5-6, 🔴 LOW pokud 1-4]
SUMMARY: [2-3 věty česky]
KEY_POINTS:
- [bod 1]
- [bod 2]
- [bod 3]
ACTION: [konkrétní věc k vyzkoušení nebo N/A]
TAGS: [#tag1 #tag2 #tag3]

Pro SCORE 1-4: pouze SCORE a TRIAGE řádek."""


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

def fetch_transcript(video_id: str, tmp_dir: str) -> str:
    url = f"https://www.youtube.com/watch?v={video_id}"
    cmd = [
        "yt-dlp", "--skip-download",
        "--write-auto-subs",
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

def triage(video: dict, transcript: str, model) -> dict:
    prompt = TRIAGE_PROMPT.format(
        title=video["title"],
        channel=video["channel"],
        transcript=transcript or "(titulky nedostupné – hodnoť jen z názvu a kanálu)"
    )
    try:
        text = model.generate_content(prompt).text.strip()
    except Exception as e:
        print(f"  ⚠️  Gemini error: {e}")
        return {"score": 5, "triage": "🟡 MEDIUM", "summary": "", "key_points": [], "action": "N/A", "tags": ""}
    return _parse_response(text)

def _parse_response(text: str) -> dict:
    r = {"score": 1, "triage": "🔴 LOW", "summary": "", "key_points": [], "action": "N/A", "tags": ""}
    for line in text.splitlines():
        if line.startswith("SCORE:"):
            try:
                r["score"] = int(re.search(r'\d+', line).group())
            except:
                pass
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

def save_summary(video: dict, analysis: dict, today: str) -> str:
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

def build_brief_text(results: list, today: str) -> str:
    high   = sorted([v for v in results if "🟢" in v["triage"]], key=lambda x: x.get("score", 0), reverse=True)
    medium = sorted([v for v in results if "🟡" in v["triage"]], key=lambda x: x.get("score", 0), reverse=True)
    low_n  = sum(1 for v in results if "🔴" in v["triage"])

    lines = [
        f"Dobré ráno. AIVOS Brain Brief pro {today}.",
        f"Dnes {len(results)} nových videí. Vysoko relevantních: {len(high)}. Středně: {len(medium)}. Přeskočených: {low_n}.",
        ""
    ]
    if high:
        lines.append("Top videa pro tebe dnes:")
        for v in high[:5]:
            lines += [f"Skóre {v.get('score','?')} z 10. {v['title']} od {v['channel']}.", v.get("summary",""), ""]
    if medium and len(high) < 3:
        lines.append("Zajímavé:")
        for v in medium[:3]:
            lines += [f"Skóre {v.get('score','?')}. {v['title']}.", v.get("summary",""), ""]
    if not high and not medium:
        lines.append("Dnes žádná relevantní videa.")
    lines.append("To je vše. Hodně štěstí.")
    return "\n".join(lines)

def save_brief(results: list, today: str):
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)
    high = sorted(
        [{"title": v["title"], "channel": v["channel"], "url": v["url"],
          "summary": v["summary"], "action": v["action"], "tags": v["tags"], "score": v.get("score", 0)}
         for v in results if "🟢" in v["triage"]], key=lambda x: x["score"], reverse=True)
    medium = sorted(
        [{"title": v["title"], "channel": v["channel"], "url": v["url"],
          "summary": v["summary"], "action": v["action"], "tags": v["tags"], "score": v.get("score", 0)}
         for v in results if "🟡" in v["triage"]], key=lambda x: x["score"], reverse=True)
    low_n = sum(1 for v in results if "🔴" in v["triage"])

    brief_data = {
        "date": today,
        "text": build_brief_text(results, today),
        "stats": {"high": len(high), "medium": len(medium), "low": low_n, "total": len(results)},
        "high": high,
        "medium": medium
    }
    (BRIEFS_DIR / f"{today}.json").write_text(json.dumps(brief_data, ensure_ascii=False, indent=2), encoding="utf-8")
    (BRIEFS_DIR / "latest.json").write_text(json.dumps(brief_data, ensure_ascii=False, indent=2), encoding="utf-8")
    index_path = BRIEFS_DIR / "index.json"
    index = load_json(index_path, [])
    if today not in index:
        index.insert(0, today)
    save_json(index_path, index)
    print(f"📄 Brief uložen: {today}.json")

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
        save_brief([], today)
        return

    results = []
    for i, video in enumerate(new_videos, 1):
        print(f"[{i}/{len(new_videos)}] {video['title'][:65]}")
        with tempfile.TemporaryDirectory() as tmp:
            transcript = fetch_transcript(video["video_id"], tmp)
        analysis = triage(video, transcript, model)
        print(f"  {analysis['triage']} ({analysis.get('score','?')}/10)")
        if "🔴" not in analysis["triage"]:
            save_summary(video, analysis, today)
        processed.add(video["video_id"])
        results.append({**video, **analysis})

    save_json(PROCESSED_FILE, list(processed))
    save_json(QUEUE_FILE, [])
    save_brief(results, today)

    h = sum(1 for r in results if "🟢" in r["triage"])
    m = sum(1 for r in results if "🟡" in r["triage"])
    l = sum(1 for r in results if "🔴" in r["triage"])
    print(f"\n📊 🟢 {h} | 🟡 {m} | 🔴 {l}")
    print("🏁 Hotovo.\n")

if __name__ == "__main__":
    main()
