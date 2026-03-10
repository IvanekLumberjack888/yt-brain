"""Stage 2: Run locally on Windows (manually or Task Scheduler).
Fetches transcripts for queued videos and saves as Markdown files.
"""
import json
import re
from datetime import date
from pathlib import Path

from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api.proxies import GenericProxyConfig

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


def _make_ytt():
    """Create YouTubeTranscriptApi instance, optionally with Chrome cookies."""
    try:
        import browser_cookie3
        cookies = browser_cookie3.chrome(domain_name=".youtube.com")
        ytt = YouTubeTranscriptApi(cookie_path=None, http_client=None)
        # Use requests session with cookies
        import requests
        session = requests.Session()
        session.cookies = cookies
        ytt = YouTubeTranscriptApi()
        ytt._http_client._session = session
        print("  [using Chrome cookies]")
        return ytt
    except Exception:
        return YouTubeTranscriptApi()


def fetch_transcript(video_id: str) -> tuple[str, str] | tuple[None, None]:
    """Returns (transcript_text, lang) or (None, None).
    Uses list() to find available languages, then fetches the best one.
    """
    # Try with cookies first, then without
    for use_cookies in [True, False]:
        ytt = _try_build_ytt(use_cookies)
        result = _fetch_with_ytt(ytt, video_id, use_cookies)
        if result[0] is not None:
            return result

    print("  ! All transcript fetches failed")
    return None, None


def _try_build_ytt(use_cookies: bool):
    if not use_cookies:
        return YouTubeTranscriptApi()
    try:
        import browser_cookie3
        import requests
        cookies = browser_cookie3.chrome(domain_name=".youtube.com")
        cookie_dict = {c.name: c.value for c in cookies}
        # Write temp netscape cookies file
        tmp = Path("data/_cookies.txt")
        tmp.parent.mkdir(exist_ok=True)
        lines = ["# Netscape HTTP Cookie File\n"]
        for c in cookies:
            lines.append(
                f".youtube.com\tTRUE\t/\t"
                f"{'TRUE' if c.secure else 'FALSE'}\t"
                f"{int(c.expires) if c.expires else 0}\t"
                f"{c.name}\t{c.value}\n"
            )
        tmp.write_text("".join(lines), encoding="utf-8")
        print("  [using Chrome cookies]")
        return YouTubeTranscriptApi(cookie_path=str(tmp))
    except Exception as e:
        print(f"  [cookies unavailable: {e}]")
        return YouTubeTranscriptApi()


def _fetch_with_ytt(ytt, video_id: str, label: bool) -> tuple:
    try:
        transcript_list = ytt.list(video_id)
    except Exception as exc:
        print(f"  ! Could not list transcripts: {exc}")
        return None, None

    available = {t.language_code: t for t in transcript_list}
    print(f"  Available languages: {list(available.keys())}")

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

    for lang_code, t in available.items():
        try:
            entries = t.fetch()
            text = _merge_entries(entries)
            if text:
                return text, lang_code
        except Exception:
            continue

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
