"""
brain/check_playlist.py – AIVOS Brain Feed (Stage 1)
Detekuje nová videa v YouTube playlistu a přidá je do queue.json
"""
import os, json, sys
from pathlib import Path
from googleapiclient.discovery import build

ROOT       = Path(__file__).parent.parent
DATA_DIR   = ROOT / "data"
QUEUE_FILE = DATA_DIR / "queue.json"
PROCESSED_FILE = DATA_DIR / "processed_videos.json"

YT_API_KEY    = os.environ.get("YT_API_KEY", "")
YT_PLAYLIST_ID = os.environ.get("YT_PLAYLIST_ID", "")
MAX_RESULTS   = 50


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_playlist_videos(api_key: str, playlist_id: str) -> list[dict]:
    youtube = build("youtube", "v3", developerKey=api_key)
    videos = []
    next_page = None

    while True:
        req = youtube.playlistItems().list(
            part="snippet",
            playlistId=playlist_id,
            maxResults=50,
            pageToken=next_page,
        )
        res = req.execute()

        for item in res.get("items", []):
            snippet = item["snippet"]
            video_id = snippet.get("resourceId", {}).get("videoId", "")
            if not video_id:
                continue
            videos.append({
                "video_id": video_id,
                "title":    snippet.get("title", ""),
                "channel":  snippet.get("videoOwnerChannelTitle", ""),
                "url":      f"https://youtube.com/watch?v={video_id}",
                "published": snippet.get("publishedAt", ""),
            })

        next_page = res.get("nextPageToken")
        if not next_page or len(videos) >= MAX_RESULTS:
            break

    return videos


def main():
    print(f"\n📡 AIVOS check_playlist\n")

    if not YT_API_KEY:
        print("❌ YT_API_KEY není nastaven.")
        sys.exit(1)
    if not YT_PLAYLIST_ID:
        print("❌ YT_PLAYLIST_ID není nastaven.")
        sys.exit(1)

    processed = set(load_json(PROCESSED_FILE, []))
    existing_queue = load_json(QUEUE_FILE, [])
    existing_ids = {v["video_id"] for v in existing_queue}

    print(f"🔍 Fetchuji playlist {YT_PLAYLIST_ID}...")
    videos = fetch_playlist_videos(YT_API_KEY, YT_PLAYLIST_ID)
    print(f"  Nalezeno {len(videos)} videí v playlistu")

    new_videos = [
        v for v in videos
        if v["video_id"] not in processed and v["video_id"] not in existing_ids
    ]
    print(f"  Nových (nezpracovaných): {len(new_videos)}")

    if new_videos:
        updated_queue = existing_queue + new_videos
        save_json(QUEUE_FILE, updated_queue)
        print(f"✅ Queue aktualizována: {len(updated_queue)} videí celkem")
        for v in new_videos:
            print(f"  + {v['title'][:65]} [{v['channel']}]")
    else:
        print("✅ Žádná nová videa.")

    print("🏁 Hotovo.\n")


if __name__ == "__main__":
    main()
