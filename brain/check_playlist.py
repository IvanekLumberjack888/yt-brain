"""Stage 1: Runs via GitHub Actions daily at 08:00 UTC.
Fetches new videos from public YouTube playlist and updates queue.json.
"""
import json
import os
from pathlib import Path
from googleapiclient.discovery import build

API_KEY = os.environ["YT_API_KEY"]
PLAYLIST_ID = os.environ["YT_PLAYLIST_ID"]

DATA_DIR = Path(__file__).parent.parent / "data"
QUEUE_FILE = DATA_DIR / "queue.json"
PROCESSED_FILE = DATA_DIR / "processed_videos.json"


def load_json(path: Path, default):
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    return default


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def fetch_playlist_videos(youtube, playlist_id: str) -> list[dict]:
    videos = []
    next_page = None
    while True:
        resp = youtube.playlistItems().list(
            part="snippet",
            playlistId=playlist_id,
            maxResults=50,
            pageToken=next_page,
        ).execute()
        for item in resp.get("items", []):
            snippet = item["snippet"]
            video_id = snippet["resourceId"]["videoId"]
            videos.append({
                "video_id": video_id,
                "title": snippet.get("title", ""),
                "channel": snippet.get("videoOwnerChannelTitle", ""),
                "published_at": snippet.get("publishedAt", ""),
                "url": f"https://youtube.com/watch?v={video_id}",
            })
        next_page = resp.get("nextPageToken")
        if not next_page:
            break
    return videos


def main():
    youtube = build("youtube", "v3", developerKey=API_KEY)

    processed = set(load_json(PROCESSED_FILE, []))
    queue = load_json(QUEUE_FILE, [])
    queued_ids = {v["video_id"] for v in queue}

    all_videos = fetch_playlist_videos(youtube, PLAYLIST_ID)
    print(f"Playlist contains {len(all_videos)} videos")

    new_videos = [
        v for v in all_videos
        if v["video_id"] not in processed and v["video_id"] not in queued_ids
    ]

    if new_videos:
        queue.extend(new_videos)
        save_json(QUEUE_FILE, queue)
        print(f"Added {len(new_videos)} new videos to queue:")
        for v in new_videos:
            print(f"  - {v['title']} ({v['video_id']})")
    else:
        print("No new videos found.")


if __name__ == "__main__":
    main()
