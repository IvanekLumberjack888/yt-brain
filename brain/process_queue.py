"""Stage 2: Run locally on Windows (manually or Task Scheduler).
Fetches transcripts for queued videos and saves as Markdown files.
"""
import json
import re
from datetime import date
from pathlib import Path
from youtube_transcript_api import YouTubeTranscriptApi

DATA_DIR = Path(__file__).parent.parent / "data"
TRANSCRIPTS_DIR = Path(__file__).parent.parent / "transcripts"
QUEUE_FILE = DATA_DIR / "queue.json"
PROCESSED_FILE = DATA_DIR / "processed_videos.json"

# Languages to try in order of preference
LANG_PRIORITY = ["en", "cs", "sk"]


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def slugify(text: str) -> str:
    text = text.lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text[:60].strip("-")


def fetch_transcript(video_id: str) -> tuple[str, str] | tuple[None, None]:
    """Returns (transcript_text, lang) or (None, None).
    Uses list_transcripts() to find available languages, then fetches the best one.
    """
    ytt = YouTubeTranscriptApi()

    try:
        transcript_list = ytt.list(video_id)
    except Exception as exc:
        print(f"  ! Could not list transcripts: {exc}")
        return None, None

    # Build map: lang_code -> transcript object
    available = {}
    for t in transcript_list:
        available[t.language_code] = t

    print(f"  Available languages: {list(available.keys())}")

    # Try preferred languages first
    for lang in LANG_PRIORITY:
        if lang in available:
            try:
                entries = available[lang].fetch()
                text = _merge_entries(entries)
                if text:
                    return text, lang
            except Exception as exc:
                print(f"  ! Fetch failed for {lang}: {exc}")
                continue

    # Fallback: take first available
    for lang_code, t in available.items():
        try:
            entries = t.fetch()
            text = _merge_entries(entries)
            if text:
                return text, lang_code
        except Exception:
            continue

    print(f"  ! All transcript fetches failed")
    return None, None


def _merge_entries(entries) -> str:
    paragraphs, chunk, chunk_start = [], [], 0.0
    for e in entries:
        if e.start - chunk_start > 30 and chunk:
            paragraphs.append(" ".join(chunk))
            chunk, chunk_start = [], e.start
        chunk.append(e.text.replace("\n", " ").strip())
    if chunk:
        paragraphs.append(" ".join(chunk))
    return "\n\n".join(paragraphs)


def save_markdown(video: dict, transcript: str | None, lang: str | None) -> Path:
    year = date.today().strftime("%Y")
    out_dir = TRANSCRIPTS_DIR / year
    out_dir.mkdir(parents=True, exist_ok=True)

    slug = slugify(video.get("title", video["video_id"]))
    filepath = out_dir / f"{slug}--{video['video_id']}.md"

    body = transcript or "_Transcript not available (captions disabled)._"
    content = f"""---
title: "{video.get('title', '')}"
channel: "{video.get('channel', '')}"
video_url: "{video.get('url', '')}"
video_id: "{video['video_id']}"
date_added: "{video.get('published_at', '')[:10]}"
date_processed: "{date.today().isoformat()}"
lang: "{lang or 'none'}"
has_transcript: {str(transcript is not None).lower()}
---

# {video.get('title', video['video_id'])}

**Channel:** {video.get('channel', 'N/A')}
**URL:** {video.get('url', '')}

## Transcript

{body}
"""
    filepath.write_text(content, encoding="utf-8")
    return filepath


def main():
    queue = load_json(QUEUE_FILE, [])
    if not queue:
        print("Queue is empty. Nothing to process.")
        return

    processed = set(load_json(PROCESSED_FILE, []))

    for video in queue:
        vid_id = video["video_id"]
        print(f"Processing: {video.get('title', vid_id)}")
        transcript, lang = fetch_transcript(vid_id)
        filepath = save_markdown(video, transcript, lang)
        status = f"✓ transcript [{lang}]" if transcript else "✗ no transcript"
        print(f"  {status} → {filepath.name}")
        processed.add(vid_id)

    save_json(PROCESSED_FILE, list(processed))
    save_json(QUEUE_FILE, [])
    print(f"\nDone. {len(queue)} videos processed.")
    print("Now run: git add . && git commit -m 'transcripts' && git push")


if __name__ == "__main__":
    main()
