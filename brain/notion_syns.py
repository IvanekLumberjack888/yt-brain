"""
brain/notion_sync.py – AIVOS Brain Feed → Notion 00 FEED
Ukládá HIGH/MEDIUM výsledky (videa i newslettery) jako stránky do Notion databáze.
Idempotentní: stejné URL se nevloží dvakrát (kontrola přes source_url property).

ENV:
  NOTION_TOKEN      – Notion integration token (secret_...)
  NOTION_FEED_DB_ID – ID databáze "00 FEED" (32 hex znaků, s/bez pomlček)

Pokud NOTION_TOKEN chybí, modul se tiše přeskočí (pipeline nespadne).
Zero extra dependency: používá jen urllib ze stdlib (žádný notion-client).
"""
import os
import json
import urllib.request
import urllib.error

NOTION_TOKEN   = os.environ.get("NOTION_TOKEN", "")
NOTION_FEED_DB = os.environ.get("NOTION_FEED_DB_ID", "")
NOTION_VERSION = "2022-06-28"
API_BASE       = "https://api.notion.com/v1"

# ── Property mapping ───────────────────────────────────────────────────────────
# Předpokládá tyto property v 00 FEED databázi (vytvoř je ručně jednou):
#   Name        → title          (název videa/článku)
#   Source URL  → url            (odkaz – slouží i jako dedup klíč)
#   Source      → select         (YouTube / Newsletter)
#   Score       → number         (1-10)
#   Triage      → select         (🟢 HIGH / 🟡 MEDIUM / 🔴 LOW)
#   Category    → select         (WORK / AI / HEALTH / ...)
#   Channel     → rich_text      (kanál / odesílatel)
#   Tags        → rich_text      (#tag1 #tag2)
#   Date        → date           (datum zpracování)
#   Status      → select         (Inbox / Processed / Archived) – default Inbox
# Pokud některá property chybí, Notion ji prostě ignoruje a zaloguje warning.


def _req(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{API_BASE}{path}"
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {NOTION_TOKEN}")
    req.add_header("Notion-Version", NOTION_VERSION)
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")[:300]
        print(f"  ⚠️ Notion {method} {path} → HTTP {e.code}: {detail}")
        return {}
    except Exception as e:
        print(f"  ⚠️ Notion {method} {path} → {e}")
        return {}


def _already_exists(url: str) -> bool:
    """Zkontroluje, jestli stránka s tímto URL už v DB existuje."""
    body = {
        "filter": {"property": "Source URL", "url": {"equals": url}},
        "page_size": 1,
    }
    res = _req("POST", f"/databases/{NOTION_FEED_DB}/query", body)
    return bool(res.get("results"))


def _rich_text(value: str) -> list:
    return [{"type": "text", "text": {"content": (value or "")[:2000]}}]


def _build_page_properties(item: dict, source_type: str, today: str) -> dict:
    """Sestaví properties dict. Bezpečné – Notion ignoruje neznámé/chybějící."""
    title = item.get("title", "Bez názvu")[:200]
    props = {
        "Name":       {"title": _rich_text(title)},
        "Source URL": {"url": item.get("url") or None},
        "Source":     {"select": {"name": source_type}},
        "Score":      {"number": item.get("score", 0)},
        "Triage":     {"select": {"name": _triage_clean(item.get("triage", "🟡 MEDIUM"))}},
        "Category":   {"select": {"name": item.get("category", "AI") or "AI"}},
        "Channel":    {"rich_text": _rich_text(item.get("channel", ""))},
        "Tags":       {"rich_text": _rich_text(item.get("tags", ""))},
        "Date":       {"date": {"start": today}},
        "Status":     {"select": {"name": "Inbox"}},
    }
    return props


def _triage_clean(triage: str) -> str:
    if "🟢" in triage or "HIGH" in triage.upper():
        return "🟢 HIGH"
    if "🔴" in triage or "LOW" in triage.upper():
        return "🔴 LOW"
    return "🟡 MEDIUM"


def _build_page_children(item: dict) -> list:
    """Tělo stránky: shrnutí + klíčové body + akční krok."""
    children = []
    summary = item.get("summary", "").strip()
    if summary:
        children.append({
            "object": "block", "type": "heading_3",
            "heading_3": {"rich_text": _rich_text("📝 Shrnutí")},
        })
        children.append({
            "object": "block", "type": "paragraph",
            "paragraph": {"rich_text": _rich_text(summary)},
        })

    key_points = [p for p in item.get("key_points", []) if p]
    if key_points:
        children.append({
            "object": "block", "type": "heading_3",
            "heading_3": {"rich_text": _rich_text("🎯 Klíčové body")},
        })
        for p in key_points[:8]:
            children.append({
                "object": "block", "type": "bulleted_list_item",
                "bulleted_list_item": {"rich_text": _rich_text(p)},
            })

    action = item.get("action", "").strip()
    if action and action not in ("N/A", "n/a", "-"):
        children.append({
            "object": "block", "type": "heading_3",
            "heading_3": {"rich_text": _rich_text("⚡ Akční krok")},
        })
        children.append({
            "object": "block", "type": "callout",
            "callout": {
                "rich_text": _rich_text(action),
                "icon": {"emoji": "⚡"},
            },
        })

    url = item.get("url")
    if url:
        children.append({
            "object": "block", "type": "paragraph",
            "paragraph": {"rich_text": [{
                "type": "text",
                "text": {"content": "🔗 Otevřít zdroj", "link": {"url": url}},
            }]},
        })
    return children


def push_item(item: dict, source_type: str, today: str) -> str:
    """Vloží jeden item do Notion. Vrací: 'created' / 'skipped' / 'error'."""
    url = item.get("url", "")
    if url and _already_exists(url):
        return "skipped"

    body = {
        "parent": {"database_id": NOTION_FEED_DB},
        "properties": _build_page_properties(item, source_type, today),
        "children": _build_page_children(item),
    }
    res = _req("POST", "/pages", body)
    return "created" if res.get("id") else "error"


def sync_to_notion(results: list, today: str, source_type: str = "YouTube") -> dict:
    """
    Hlavní entry point. results = list dictů s klíči:
      title, channel, url, score, triage, category, summary, key_points, action, tags
    Ukládá pouze HIGH + MEDIUM (LOW se přeskakuje – šum do druhého mozku nepatří).
    """
    stats = {"created": 0, "skipped": 0, "error": 0, "low_filtered": 0}

    if not NOTION_TOKEN or not NOTION_FEED_DB:
        print("  ℹ️ NOTION_TOKEN/NOTION_FEED_DB_ID není nastaven – Notion sync přeskočen.")
        return stats

    relevant = [r for r in results if "🔴" not in r.get("triage", "")]
    stats["low_filtered"] = len(results) - len(relevant)

    print(f"  🔄 Notion sync: {len(relevant)} relevantních ({source_type})...")
    for item in relevant:
        outcome = push_item(item, source_type, today)
        stats[outcome] = stats.get(outcome, 0) + 1

    print(f"  ✅ Notion: {stats['created']} nových, {stats['skipped']} už existovalo, {stats['error']} chyb")
    return stats


if __name__ == "__main__":
    # Smoke test – ověří připojení a strukturu DB
    if not NOTION_TOKEN or not NOTION_FEED_DB:
        print("❌ Nastav NOTION_TOKEN a NOTION_FEED_DB_ID pro test.")
        raise SystemExit(1)
    print("🔍 Testuji připojení k Notion DB...")
    res = _req("GET", f"/databases/{NOTION_FEED_DB}")
    if res.get("id"):
        title = res.get("title", [{}])
        name = title[0].get("plain_text", "?") if title else "?"
        print(f"✅ Připojeno k DB: {name}")
        props = res.get("properties", {})
        print(f"   Properties: {', '.join(props.keys())}")
    else:
        print("❌ Nepodařilo se připojit. Zkontroluj token a DB ID + sdílení integrace.")
