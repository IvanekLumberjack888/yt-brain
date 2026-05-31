"""
brain/process_queue.py – AIVOS Brain Feed (Stage 2)
====================================================
Čte data/queue.json (naplněný check_playlist.py),
zpracuje každé video přes yt-dlp + Gemini Flash,
uloží sumarizace do summaries/ a vygeneruje ranní brief.

GitHub Secrets potřebné:
  GEMINI_API_KEY  – z https://aistudio.google.com/app/apikey (zdarma)
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

# ─── CESTY ───────────────────────────────────────────────────────────────────
ROOT           = Path(__file__).parent.parent
DATA_DIR       = ROOT / "data"
QUEUE_FILE     = DATA_DIR / "queue.json"
PROCESSED_FILE = DATA_DIR / "processed_videos.json"
SUMMARIES_DIR  = ROOT / "summaries"
BRIEFS_DIR     = ROOT / "public" / "briefs"   # Next.js static serving
# ─────────────────────────────────────────────────────────────────────────────

GEMINI_MODEL   = "gemini-2.0-flash"
MAX_TRANSCRIPT = 8000

TRIAGE_PROMPT = """Jsi knowledge triage systém pro Junior Data Engineera učícího se:
Azure (ADF, Databricks, Event Hub, Service Bus), Python, SQL, data engineering,
ETL/ELT pipeline, AI/LLM, RAG, MCP, Claude, automatizace, produktivita pro tech.

Video: {title}
Kanál: {channel}
Transkript: {transcript}

Ohodnoť jednou ze tří kategorií:
🟢 HIGH – přímo do roadmapy: Azure stack, Python, SQL, data engineering,
           AI/LLM/RAG/embeddings, MCP, Claude/Gemini, automatizace workflow,
           second brain pro tech, career growth v IT
🟡 MEDIUM – obecně užitečný tech/learning/soft-skills obsah
🔴 LOW – zábava, business/marketing bez tech obsahu, nesouvisí s učením

Pro 🟢 a 🟡 vyplň sekce níže. Pro 🔴 POUZE první řádek.

Odpovídej česky, technické pojmy anglicky. Max 5 bullet points.

TRIAGE: [🟢 HIGH / 🟡 MEDIUM / 🔴 LOW]
SUMMARY: 2-3 věty co video obsahuje.
KEY_POINTS:
- bod
ACTION: jedna konkrétní věc k vyzkoušení (nebo N/A)
TAGS: #tag1 #tag2 #tag3"""


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
        transcript=transcript or "(titulky nedostupné)"
    )
    try:
        text = model.generate_content(prompt).text.strip()
    except Exception as e:
        print(f"  ⚠️  Gemini error: {e}")
        return {"triage": "🔴 LOW", "summary": "", "key_points": [], "action": "N/A", "tags": ""}
    return _parse_response(text)

def _parse_response(text: str) -> dict:
    r = {"triage": "🔴 LOW", "summary": "", "key_points": [], "action": "N/A", "tags": ""}
    for line in text.splitlines():
        if line.startswith("TRIAGE:"):
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
triage: "{analysis['triage']}"
tags: {analysis['tags']}
type: youtube-summary
---

# {video['title']}

> {analysis['triage']} | [{video['channel']}]({video['url']}) | {today}

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
    high   = [v for v in results if "🟢" in v["triage"]]
    medium = [v for v in results if "🟡" in v["triage"]]
    low_n  = sum(1 for v in results if "🔴" in v["triage"])

    lines = [
        f"Dobré ráno. AIVOS Brain Brief pro {today}.",
        f"Dnes {len(results)} nových videí. Vysoko relevantních: {len(high)}. Středně: {len(medium)}. Přeskočených: {low_n}.",
        ""
    ]
    for v in (high + medium)[:6]:
        lines += [f"Video: {v['title']} od {v['channel']}.", v["summary"], ""]

    if not high and not medium:
        lines.append("Dnes žádná relevantní videa. Hodný den na práci.")
    lines.append("To je vše pro dnešní ráno. Hodně štěstí.")
    return "\n".join(lines)

def save_brief(results: list, today: str):
    """Uloží dated brief + latest brief + aktualizuje index.json."""
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)

    brief_text = build_brief_text(results, today)

    high   = [{"title": v["title"], "channel": v["channel"], "url": v["url"], "summary": v["summary"], "action": v["action"], "tags": v["tags"]} for v in results if "🟢" in v["triage"]]
    medium = [{"title": v["title"], "channel": v["channel"], "url": v["url"], "summary": v["summary"], "action": v["action"], "tags": v["tags"]} for v in results if "🟡" in v["triage"]]
    low_n  = sum(1 for v in results if "🔴" in v["triage"])

    brief_data = {
        "date": today,
        "text": brief_text,
        "stats": {"high": len(high), "medium": len(medium), "low": low_n, "total": len(results)},
        "high": high,
        "medium": medium
    }

    # Dated soubor (nikdy se nepřepíše)
    (BRIEFS_DIR / f"{today}.json").write_text(
        json.dumps(brief_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Latest (přepíše se každý den – pro rychlý přístup)
    (BRIEFS_DIR / "latest.json").write_text(
        json.dumps(brief_data, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Index – seznam všech dostupných dat
    index_path = BRIEFS_DIR / "index.json"
    index = load_json(index_path, [])
    if today not in index:
        index.insert(0, today)  # nejnovější první
    save_json(index_path, index)

    print(f"📄 Brief uložen: {today}.json + latest.json + index.json aktualizován.")


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
        print(f"  {analysis['triage']}")

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
