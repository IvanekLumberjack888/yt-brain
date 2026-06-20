"""
brain/process_queue.py – AIVOS Brain Feed (Stage 2)
Triage + podcast script + edge-tts .mp3
Používá Claude Haiku (Anthropic API) místo Gemini.
Max 15 videí per run, sleep 2s mezi voláními.
"""
print("[START] process_queue.py", flush=True)

import os, json, re, glob, subprocess, tempfile, sys, asyncio, time
from datetime import date
from pathlib import Path
import warnings
warnings.filterwarnings("ignore")

import anthropic
import edge_tts

print("[OK] imports done", flush=True)

ROOT            = Path(__file__).parent.parent
DATA_DIR        = ROOT / "data"
QUEUE_FILE      = DATA_DIR / "queue.json"
PROCESSED_FILE  = DATA_DIR / "processed_videos.json"
SUMMARIES_DIR   = ROOT / "summaries"
TRANSCRIPTS_DIR = ROOT / "transcripts" / "2026"
BRIEFS_DIR      = ROOT / "public" / "briefs"

CLAUDE_MODEL       = "claude-haiku-4-5-20251001"
MAX_TRANSCRIPT     = 10000
TTS_VOICE          = "cs-CZ-AntoninNeural"
RATE_LIMIT_SLEEP   = 2     # Claude API nemá přísný RPM limit
MAX_VIDEOS_PER_RUN = 15
PROCESSING_BUDGET  = 25 * 60

TRIAGE_PROMPT = """Jsi osobní knowledge kurátor pro Iva – Junior Data Engineera (Konica Minolta, Azure stack).
Ivo má neurodivergentní profil (ADHD-PI, INTJ). Chce growth v IT + AI + osobním životě.

TIER 1 – skóre 9-10 (okamžitě důležité):
• Azure: Data Factory, Databricks, Event Hub, Service Bus, Synapse, Fabric, DP-700, AZ-900
• Data Engineering: Python, PySpark, SQL, ETL/ELT, dbt, Medallion architektura
• AI/LLM: RAG, embeddings, vector DB, LangChain, AI agents, LLMOps, MCP
• Claude ekosystém: Claude Code, Claude skills, Anthropic API, Cowork
• Microsoft Copilot: Copilot Studio, M365 Copilot, Copilot agenti, Foundry
• Second Brain / PKM: Notion, PARA, knowledge management pro tech
• ADHD + neurodivergence: produktivita, energy management, systémy pro ADHD mozek

TIER 2 – skóre 7-8 (velmi zajímavé):
• AI nástroje: Cursor, Gemini, n8n, automation workflow
• Python pro data/AI: pandas, FastAPI, async, OOP, pytest
• Career v IT: junior → senior growth, soft skills, salary negotiation
• Git, GitHub Actions, CI/CD, Docker, Kubernetes
• Microsoft ekosystém obecně: Teams, SharePoint, Azure DevOps
• Finance + AI: pasivní příjem, Gumroad, side hustle s AI

TIER 3 – skóre 5-6 (zajímavé):
• Health + pohyb, obecný AI obsah, tech news, JS/TS, webdev
• Osobní rozvoj, bezpečnost, vaření

TIER 4 – skóre 1-4 (přeskočit):
• Marketing, zábava, geopolitika, fitness bez aplikace

PRAVIDLA:
• "Claude Code" nebo "Claude" + tech = vždy 9+
• "MCP", "RAG", "Databricks", "Azure" = vždy 8+
• "n8n", "second brain", "Notion" = vždy 7+
• "ADHD"/"neurodivergent" = vždy 7+
• "Data with Baraa", "NetworkChuck", "Fireship", "Karpathy" = vždy 7+

Video název: {title}
Kanál: {channel}
Transkript: {transcript}

Formát odpovědi (přesně takto):
SCORE: [1-10]
TRIAGE: [🟢 HIGH / 🟡 MEDIUM / 🔴 LOW]
CATEGORY: [WORK / AI / HEALTH / FINANCE / LIFE / ADHD / PKM]
SUMMARY: [2-3 věty česky – z transkriptu, ne jen z názvu]
KEY_POINTS:
- [konkrétní věc z videa]
- [konkrétní věc z videa]
- [konkrétní věc z videa]
ACTION: [co konkrétně vyzkoušet – nebo N/A]
TAGS: [#tag1 #tag2 #tag3]

Pro SCORE 1-4: pouze SCORE, TRIAGE a CATEGORY."""

PODCAST_PROMPT = """Jsi moderátor tech podcastu "AIVOS Brain Brief" pro Iva – Junior Data Engineera.
Napiš skript pro ranní poslech v autě. Mluv přímo na Iva, přátelsky ale věcně. Česky.
Technické termíny anglicky. Délka: 8–15 minut čteného textu.

Struktura:
1. Úvod (3 věty): pozdrav, datum, rychlý přehled co ho dnes čeká
2. HIGH videa (podrobně): název, youtuber, o čem je, 2-3 klíčové věci, co z toho použít
3. MEDIUM videa (stručně): každé 2-3 větami + jeden tip
4. Závěr: shrnutí, jeden konkrétní tip na odpolední deep dive, rozloučení

Tón: jako přítel-kolega tech guy, ne robot. Říkej "ty" ne "vy".
Nepoužívej markdown ani formátování – jen čistý text pro TTS.

YouTube data:
{brief_data}"""


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
    if not TRANSCRIPTS_DIR.exists():
        return ""
    for md_file in TRANSCRIPTS_DIR.glob(f"*--{video_id}.md"):
        text = md_file.read_text(encoding="utf-8")
        if "## Transcript" in text:
            return text.split("## Transcript", 1)[1].strip()[:MAX_TRANSCRIPT]
        return text[:MAX_TRANSCRIPT]
    return ""


def fetch_transcript_ytdlp(video_id: str, tmp_dir: str) -> str:
    url = f"https://www.youtube.com/watch?v={video_id}"
    cmd = [
        "yt-dlp", "--skip-download",
        "--write-auto-subs", "--write-subs",
        "--sub-langs", "cs,sk,en",
        "--sub-format", "vtt",
        "--output", os.path.join(tmp_dir, "%(id)s.%(ext)s"),
        "--no-warnings", "--quiet", url
    ]
    subprocess.run(cmd, capture_output=True, timeout=60)
    for lang in ["cs", "sk", "en"]:
        files = glob.glob(os.path.join(tmp_dir, f"*.{lang}.vtt"))
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
    existing = find_existing_transcript(video["video_id"])
    if existing and len(existing) > 200:
        return existing, "existing"
    with tempfile.TemporaryDirectory() as tmp:
        transcript = fetch_transcript_ytdlp(video["video_id"], tmp)
        if transcript:
            return transcript, "yt-dlp"
    return "", "none"


HIGH_KEYWORDS = [
    "claude code", "claude cowork", "mcp", "databricks", "azure data factory",
    "rag", "langchain", "n8n", "second brain", "data engineering",
    "python data", "pyspark", "dp-700", "fabric", "microsoft fabric",
    "azure", "llm", "vector", "embedding", "agent", "automation",
    "notion", "pkm", "knowledge base", "adhd", "neurodivergent",
    "copilot studio", "microsoft foundry", "tiago forte",
]
HIGH_CHANNELS = [
    "data with baraa", "networkchuck", "fireship", "andrej karpathy",
    "karpathy", "techwithtim", "microsoft reactor", "kratosbi",
]


def keyword_boost(title: str, channel: str) -> int | None:
    title_l, ch_l = title.lower(), channel.lower()
    if any(kw in title_l for kw in HIGH_KEYWORDS):
        return 9
    if any(ch in ch_l for ch in HIGH_CHANNELS):
        return 9
    return None


def claude_call(client: anthropic.Anthropic, prompt: str, max_retries: int = 3) -> str:
    """Volá Claude Haiku s retry logikou."""
    for attempt in range(max_retries):
        try:
            msg = client.messages.create(
                model=CLAUDE_MODEL,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )
            return msg.content[0].text.strip()
        except Exception as e:
            err = str(e)
            if "429" in err or "overloaded" in err.lower() or "rate" in err.lower():
                wait = 30 * (attempt + 1)
                print(f"  ⏳ Rate limit, čekám {wait}s (pokus {attempt+1}/{max_retries})...", flush=True)
                time.sleep(wait)
            else:
                raise
    raise Exception(f"Claude API selhal po {max_retries} pokusech")


def triage_video(video: dict, transcript: str, client: anthropic.Anthropic) -> dict:
    forced_score = keyword_boost(video["title"], video["channel"])
    prompt = TRIAGE_PROMPT.format(
        title=video["title"],
        channel=video["channel"],
        transcript=transcript or "(transkript nedostupny – hodnoť jen z nazvu a kanalu)"
    )
    try:
        text = claude_call(client, prompt)
    except Exception as e:
        print(f"  ⚠️ Claude error: {e}", flush=True)
        result = {"score": 5, "triage": "🟡 MEDIUM", "category": "AI",
                  "summary": "", "key_points": [], "action": "N/A", "tags": ""}
        if forced_score:
            result["score"] = forced_score
            result["triage"] = "🟢 HIGH"
        return result

    result = _parse_triage(text)
    if forced_score and result["score"] < forced_score:
        result["score"] = forced_score
        result["triage"] = "🟢 HIGH"
        print(f"  ⚡ Keyword boost → 🟢 HIGH (9/10)", flush=True)

    if "🔴" not in result["triage"] and not result["summary"].strip():
        if transcript and len(transcript) > 200:
            try:
                p = (f"Shrn ve 2 vetach cesky o cem je toto video pro Data Engineera. "
                     f"Nazev: {video['title']}. Kanal: {video['channel']}. "
                     f"Transkript: {transcript[:3000]}")
                result["summary"] = claude_call(client, p).strip()[:400]
            except Exception:
                result["summary"] = f"Video '{video['title']}' od {video['channel']}."
        else:
            result["summary"] = f"Video '{video['title']}' od {video['channel']}. Transkript nedostupny."
    return result


def _parse_triage(text: str) -> dict:
    r = {"score": 1, "triage": "🔴 LOW", "category": "AI",
         "summary": "", "key_points": [], "action": "N/A", "tags": ""}
    for line in text.splitlines():
        if line.startswith("SCORE:"):
            try: r["score"] = int(re.search(r"\d+", line).group())
            except: pass
        elif line.startswith("TRIAGE:"):
            v = line.replace("TRIAGE:", "").strip()
            r["triage"] = "🟢 HIGH" if "🟢" in v else ("🟡 MEDIUM" if "🟡" in v else "🔴 LOW")
        elif line.startswith("CATEGORY:"):
            r["category"] = line.replace("CATEGORY:", "").strip()
        elif line.startswith("SUMMARY:"):
            r["summary"] = line.replace("SUMMARY:", "").strip()
        elif line.startswith("ACTION:"):
            r["action"] = line.replace("ACTION:", "").strip()
        elif line.startswith("TAGS:"):
            r["tags"] = line.replace("TAGS:", "").strip()
        elif line.startswith("- ") and r["summary"]:
            r["key_points"].append(line[2:].strip())
    return r


def save_summary(video: dict, analysis: dict, today: str, transcript_source: str):
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
category: "{analysis.get('category', '')}"
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


def _fmt_action(action: str) -> str:
    if not action or action.strip() in ("N/A", "n/a", "-", ""):
        return ""
    return action.strip()


def generate_podcast_script(results: list, today: str, client: anthropic.Anthropic) -> str:
    high   = [v for v in results if "🟢" in v["triage"]]
    medium = [v for v in results if "🟡" in v["triage"]]
    low_n  = sum(1 for v in results if "🔴" in v["triage"])

    brief_data = f"Datum: {today}\nCelkem videí: {len(results)}\nHIGH: {len(high)}, MEDIUM: {len(medium)}, PRESKOCENO: {low_n}\n\n"

    if high:
        brief_data += "=== HIGH RELEVANCE VIDEA ===\n"
        for v in high:
            summary = v.get("summary") or f"Video o tematu {v['title']} od {v['channel']}."
            kp = [p for p in v.get("key_points", []) if p]
            action = _fmt_action(v.get("action", ""))
            brief_data += f"\nVideo: {v['title']}\nYouTuber: {v['channel']}\nSkore: {v.get('score','?')}/10\nShrnutí: {summary}\n"
            if kp:
                brief_data += f"Klíčové body: {', '.join(kp)}\n"
            if action:
                brief_data += f"Co vyzkousit: {action}\n"

    if medium:
        brief_data += "\n=== MEDIUM RELEVANCE VIDEA ===\n"
        for v in medium[:6]:
            summary = v.get("summary") or f"Video o tematu {v['title']}."
            brief_data += f"\nVideo: {v['title']}\nYouTuber: {v['channel']}\nShrnutí: {summary}\n"

    if not high and not medium:
        return (f"Dobre rano Ivo! Dnes {today} zadna nova relevantni videa. "
                f"Pridej neco do AIVOS Queue playlistu. Hodne stesti!")

    prompt = PODCAST_PROMPT.format(brief_data=brief_data)
    try:
        return claude_call(client, prompt).strip()
    except Exception as e:
        print(f"  Podcast script error: {e}", flush=True)
        lines = [f"Dobre rano Ivo! Dnes {today} mam pro tebe {len(high)} dulezitych a {len(medium)} zajimavych videí."]
        for v in high:
            lines.append(f"Video {v['title']} od {v['channel']}. {v.get('summary','')}")
        for v in medium[:3]:
            lines.append(f"Take {v['title']}. {v.get('summary','')}")
        lines.append("To je vse. Hodne stesti!")
        return " ".join(lines)


async def text_to_mp3(text: str, output_path: str):
    communicate = edge_tts.Communicate(text, TTS_VOICE)
    await communicate.save(output_path)


def save_brief(results: list, today: str, podcast_script: str):
    BRIEFS_DIR.mkdir(parents=True, exist_ok=True)

    def _fmt(v):
        return {
            "title":      v["title"],
            "channel":    v["channel"],
            "url":        v["url"],
            "summary":    v.get("summary", ""),
            "action":     v.get("action", "N/A"),
            "tags":       v.get("tags", ""),
            "score":      v.get("score", 0),
            "category":   v.get("category", ""),
            "key_points": v.get("key_points", []),
        }

    high   = sorted([_fmt(v) for v in results if "🟢" in v["triage"]], key=lambda x: x["score"], reverse=True)
    medium = sorted([_fmt(v) for v in results if "🟡" in v["triage"]], key=lambda x: x["score"], reverse=True)
    low_n  = sum(1 for v in results if "🔴" in v["triage"])

    brief_data = {
        "date":      today,
        "text":      podcast_script,
        "stats":     {"high": len(high), "medium": len(medium), "low": low_n, "total": len(results)},
        "high":      high,
        "medium":    medium,
        "has_audio": True,
    }

    (BRIEFS_DIR / f"{today}.json").write_text(
        json.dumps(brief_data, ensure_ascii=False, indent=2), encoding="utf-8")
    (BRIEFS_DIR / "latest.json").write_text(
        json.dumps(brief_data, ensure_ascii=False, indent=2), encoding="utf-8")

    index_path = BRIEFS_DIR / "index.json"
    index = load_json(index_path, [])
    if today not in index:
        index.insert(0, today)
    save_json(index_path, index)
    print("📄 Brief JSON ulozen.", flush=True)


def main():
    today = date.today().isoformat()
    print(f"\n🧠 AIVOS process_queue | {today}\n", flush=True)

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("❌ ANTHROPIC_API_KEY neni nastaven.", flush=True)
        sys.exit(1)

    client = anthropic.Anthropic(api_key=api_key)
    print("[OK] Claude Haiku client ready", flush=True)

    queue     = load_json(QUEUE_FILE, [])
    processed = set(load_json(PROCESSED_FILE, []))
    all_new   = [v for v in queue if v["video_id"] not in processed]
    new_videos = all_new[:MAX_VIDEOS_PER_RUN]
    remaining  = len(all_new) - len(new_videos)

    print(f"📥 Queue: {len(queue)} celkem | {len(all_new)} novych | zpracuji {len(new_videos)} (max {MAX_VIDEOS_PER_RUN}/run)", flush=True)
    if remaining > 0:
        print(f"  ℹ️  {remaining} videí zbylá na příští run", flush=True)

    if not new_videos:
        print("✅ Nic noveho v queue.", flush=True)
        script = f"Dobre rano Ivo! Dnes {today} zadna nova videa v AIVOS Queue. Hodne stesti v praci!"
        save_brief([], today, script)
        asyncio.run(text_to_mp3(script, str(BRIEFS_DIR / "latest_brief.mp3")))
        asyncio.run(text_to_mp3(script, str(BRIEFS_DIR / f"{today}_brief.mp3")))
        return

    results = []
    run_start = time.monotonic()
    for i, video in enumerate(new_videos, 1):
        if time.monotonic() - run_start > PROCESSING_BUDGET:
            print(f"  ⏱️  Budget {PROCESSING_BUDGET//60} min vycerpan.", flush=True)
            break
        print(f"[{i}/{len(new_videos)}] {video['title'][:65]}", flush=True)
        transcript, source = get_transcript(video)
        print(f"  📄 Transkript: {source} ({len(transcript)} znaku)", flush=True)
        analysis = triage_video(video, transcript, client)
        print(f"  {analysis['triage']} ({analysis.get('score','?')}/10) [{analysis.get('category','')}]", flush=True)
        if "🔴" not in analysis["triage"]:
            save_summary(video, analysis, today, source)
        processed.add(video["video_id"])
        results.append({**video, **analysis})
        if i < len(new_videos):
            time.sleep(RATE_LIMIT_SLEEP)

    save_json(PROCESSED_FILE, list(processed))
    save_json(QUEUE_FILE, [v for v in queue if v["video_id"] not in processed])

    print("\n🎙️ Generuji podcast skript...", flush=True)
    podcast_script = generate_podcast_script(results, today, client)
    print(f"  Delka: {len(podcast_script)} znaku (~{len(podcast_script)//15} sekund)", flush=True)

    print("🔊 Prevadam na audio...", flush=True)
    asyncio.run(text_to_mp3(podcast_script, str(BRIEFS_DIR / "latest_brief.mp3")))
    asyncio.run(text_to_mp3(podcast_script, str(BRIEFS_DIR / f"{today}_brief.mp3")))
    print("  ✅ Audio ulozeno", flush=True)

    save_brief(results, today, podcast_script)

    h = sum(1 for r in results if "🟢" in r["triage"])
    m = sum(1 for r in results if "🟡" in r["triage"])
    l = sum(1 for r in results if "🔴" in r["triage"])
    still_queued = len([v for v in queue if v["video_id"] not in processed])
    print(f"\n📊 🟢 {h} | 🟡 {m} | 🔴 {l}", flush=True)
    if still_queued > 0:
        print(f"  ℹ️  {still_queued} videí ceka na dalsi run", flush=True)
    print("🏁 Hotovo.\n", flush=True)


if __name__ == "__main__":
    main()
