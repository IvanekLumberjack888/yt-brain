"""
brain/newsletter_brief.py – AIVOS Newsletter Feed
Parsuje newsletter emaily (Medium Daily Digest, HN, Dev.to, TLDR...) z Gmailu,
extrahuje jednotlivé články a triážuje je stejnou logikou jako YouTube videa.

Rozdíl oproti gmail_brief.py:
  - gmail_brief.py = "kolik emailů přišlo" (počítání pro ranní brief)
  - newsletter_brief.py = "rozparsuj newslettery na články + ohodnoť" (obsah → 00 FEED)

ENV:
  GMAIL_USER         – ivousd@gmail.com
  GMAIL_APP_PASSWORD – app password
  GEMINI_API_KEY     – pro triage

Vrací list dictů kompatibilní s triage výstupem (stejný formát jako videa),
takže se dá poslat do save_brief() i sync_to_notion() beze změny.
"""
import imaplib
import email
import os
import re
import time
import socket
from datetime import date, timedelta
from email.header import decode_header as _dh
import google.generativeai as genai

GMAIL_USER         = os.environ.get("GMAIL_USER", "ivousd@gmail.com")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
IMAP_TIMEOUT       = 25
GEMINI_MODEL       = "gemini-2.0-flash"
MAX_ARTICLES       = 12   # max článků z newsletterů per run (rate limit guard)

# Odesílatelé, které CHCEME parsovat jako newslettery (whitelist)
NEWSLETTER_SENDERS = [
    "noreply@medium.com", "digest@medium.com",
    "newsletter@tldrnewsletter.com", "dan@tldrnewsletter.com",
    "hello@dev.to", "noreply@dev.to",
    "kill-the-newsletter", "hnrss",
]

# ── Stejná triage logika jako u videí, ale pro články ──────────────────────────
HIGH_KEYWORDS = [
    "claude code", "claude cowork", "claude skill", "mcp", "databricks",
    "azure data factory", "rag", "langchain", "n8n", "second brain",
    "data engineering", "pyspark", "dp-700", "fabric", "azure",
    "llm", "vector", "embedding", "agent", "automation", "notion",
    "pkm", "knowledge base", "adhd", "neurodivergent", "copilot",
    "anthropic", "llmops",
]

ARTICLE_TRIAGE_PROMPT = """Jsi knowledge kurátor pro Iva – Junior Data Engineera (Konica Minolta, Azure stack, ADHD-PI, INTJ).
Dostaneš seznam článků z newsletteru. Pro KAŽDÝ článek vrať skóre relevance.

TIER 1 (9-10): Claude Code/Skills/MCP, Azure (ADF, Databricks, Fabric, DP-700), RAG, LangChain,
  LLM agents, LLMOps, vector DB, second brain/PKM, Notion automation, n8n, ADHD produktivita
TIER 2 (7-8): AI nástroje (Cursor, Gemini, Copilot), Python pro data/AI, GitHub Actions, CI/CD,
  career growth v IT, AI side hustle/Gumroad
TIER 3 (5-6): obecný AI obsah, tech news, JS/TS/React, cloud obecně, osobní rozvoj
TIER 4 (1-4): čistý marketing, "X is dead" clickbait, "$X/month while you sleep", DevOps/K8s
  (mimo Ivův stack), fitness, geopolitika, entertainment

PRAVIDLA:
• "Claude" + tech = vždy 9+
• "MCP", "RAG", "Databricks", "Azure" = vždy 8+
• "n8n", "automation", "second brain", "Notion" = vždy 7+
• "ADHD"/"neurodivergent" = vždy 7+
• clickbait nadpisy ("X is dead", "top 1%", "$450/month") = max 3

Články:
{articles_text}

Vrať PŘESNĚ tento formát (jeden blok per článek, oddělené prázdným řádkem):
INDEX: [číslo článku]
SCORE: [1-10]
CATEGORY: [WORK / AI / HEALTH / FINANCE / LIFE / ADHD / PKM]
SUMMARY: [1 věta česky – proč je/není relevantní pro Iva]
"""


def _decode(value: str) -> str:
    try:
        parts = _dh(value or "")
        out = []
        for part, charset in parts:
            if isinstance(part, bytes):
                out.append(part.decode(charset or "utf-8", errors="ignore"))
            else:
                out.append(str(part))
        return " ".join(out).strip()
    except Exception:
        return str(value or "")


def _get_html_body(msg) -> str:
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/html":
                try:
                    return part.get_payload(decode=True).decode("utf-8", errors="ignore")
                except Exception:
                    pass
    else:
        try:
            return msg.get_payload(decode=True).decode("utf-8", errors="ignore")
        except Exception:
            pass
    return ""


def _extract_articles_from_html(html: str, sender: str) -> list[dict]:
    """
    Vytáhne z HTML newsletteru dvojice (nadpis, URL).
    Generický parser: hledá <a href="...">Nadpis</a> kde nadpis vypadá jako titulek
    (>25 znaků, není to "unsubscribe"/"view in browser" apod.).
    """
    articles = []
    seen_urls = set()

    # Najdi všechny <a> s textem
    for m in re.finditer(r'<a\s+[^>]*href="([^"]+)"[^>]*>(.*?)</a>', html, re.DOTALL | re.IGNORECASE):
        url = m.group(1)
        text = re.sub(r"<[^>]+>", "", m.group(2))  # strip vnořené tagy
        text = re.sub(r"\s+", " ", text).strip()

        # Filtry: skutečné články, ne nav/footer linky
        if len(text) < 25 or len(text) > 200:
            continue
        low = text.lower()
        if any(skip in low for skip in [
            "unsubscribe", "view in browser", "become a member", "sign in",
            "privacy policy", "terms of", "app store", "google play",
            "control your recommendations", "see more", "read from anywhere",
            "careers", "help center", "switch to", "odhlásit", "staňte se",
        ]):
            continue
        # Medium tracking URL → vyčisti
        clean_url = url.split("?")[0]
        if clean_url in seen_urls:
            continue
        seen_urls.add(clean_url)

        articles.append({
            "title": text,
            "url": clean_url,
            "channel": _sender_name(sender),
        })

    return articles[:8]  # max 8 článků per newsletter


def _sender_name(sender: str) -> str:
    if "medium" in sender.lower():
        return "Medium Digest"
    if "tldr" in sender.lower():
        return "TLDR"
    if "dev.to" in sender.lower():
        return "Dev.to"
    if "hnrss" in sender.lower() or "hacker" in sender.lower():
        return "Hacker News"
    m = re.search(r"<([^>]+)>", sender)
    return (m.group(1) if m else sender)[:40]


def fetch_newsletters() -> list[dict]:
    """Stáhne newsletter emaily z whitelistu a vyextrahuje články."""
    if not GMAIL_APP_PASSWORD:
        print("  ℹ️ GMAIL_APP_PASSWORD není nastaven – newsletter parsing přeskočen.")
        return []

    all_articles = []
    try:
        socket.setdefaulttimeout(IMAP_TIMEOUT)
        mail = imaplib.IMAP4_SSL("imap.gmail.com", 993)
        mail.login(GMAIL_USER, GMAIL_APP_PASSWORD)
        mail.select("inbox")

        since = (date.today() - timedelta(days=1)).strftime("%d-%b-%Y")
        _, ids = mail.search(None, f"SINCE {since}")
        msg_ids = ids[0].split()
        if not msg_ids:
            mail.logout()
            return []

        for mid in reversed(msg_ids[-40:]):
            try:
                _, data = mail.fetch(mid, "(RFC822)")
                msg = email.message_from_bytes(data[0][1])
                sender = _decode(msg.get("From", "")).lower()

                if not any(ns in sender for ns in NEWSLETTER_SENDERS):
                    continue

                html = _get_html_body(msg)
                if not html:
                    continue

                articles = _extract_articles_from_html(html, sender)
                print(f"  📰 {_sender_name(sender)}: {len(articles)} článků")
                all_articles.extend(articles)
            except Exception as e:
                print(f"  ⚠️ Newsletter parse error: {e}")
                continue

        mail.logout()
    except Exception as e:
        print(f"  ⚠️ Newsletter IMAP error: {e}")
        return []
    finally:
        socket.setdefaulttimeout(None)

    # Dedup podle URL napříč newslettery
    seen = set()
    deduped = []
    for a in all_articles:
        if a["url"] not in seen:
            seen.add(a["url"])
            deduped.append(a)
    return deduped[:MAX_ARTICLES]


def _keyword_score(title: str) -> int | None:
    t = title.lower()
    if any(kw in t for kw in HIGH_KEYWORDS):
        return 8
    return None


def _parse_triage_response(text: str, articles: list[dict]) -> list[dict]:
    """Naparsuje odpověď LLM (bloky INDEX/SCORE/CATEGORY/SUMMARY) zpět na články."""
    blocks = re.split(r"\n\s*\n", text)
    scored = {}
    for block in blocks:
        idx = score = cat = summ = None
        for line in block.splitlines():
            line = line.strip()
            if line.startswith("INDEX:"):
                try: idx = int(re.search(r"\d+", line).group())
                except: pass
            elif line.startswith("SCORE:"):
                try: score = int(re.search(r"\d+", line).group())
                except: pass
            elif line.startswith("CATEGORY:"):
                cat = line.replace("CATEGORY:", "").strip()
            elif line.startswith("SUMMARY:"):
                summ = line.replace("SUMMARY:", "").strip()
        if idx is not None and score is not None:
            scored[idx] = {"score": score, "category": cat or "AI", "summary": summ or ""}

    results = []
    for i, art in enumerate(articles, 1):
        s = scored.get(i, {"score": 5, "category": "AI", "summary": ""})
        # keyword boost override
        kb = _keyword_score(art["title"])
        final_score = max(s["score"], kb) if kb else s["score"]
        triage = "🟢 HIGH" if final_score >= 7 else ("🟡 MEDIUM" if final_score >= 5 else "🔴 LOW")
        results.append({
            "title":      art["title"],
            "channel":    art["channel"],
            "url":        art["url"],
            "score":      final_score,
            "triage":     triage,
            "category":   s["category"],
            "summary":    s["summary"],
            "key_points": [],
            "action":     "",
            "tags":       "#newsletter",
        })
    return results


def process_newsletters(model=None) -> list[dict]:
    """
    Hlavní entry point. Vrací list triážovaných článků (formát = jako videa).
    Volej z process_queue.py main().
    """
    articles = fetch_newsletters()
    if not articles:
        print("  ℹ️ Žádné newsletter články k zpracování.")
        return []

    print(f"  🧠 Triážuju {len(articles)} článků z newsletterů...")

    if model is None:
        api_key = os.environ.get("GEMINI_API_KEY")
        if not api_key:
            print("  ⚠️ GEMINI_API_KEY chybí – jen keyword scoring.")
            return _parse_triage_response("", articles)
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel(GEMINI_MODEL)

    articles_text = "\n\n".join(
        f"[{i}] {a['title']} ({a['channel']})"
        for i, a in enumerate(articles, 1)
    )
    prompt = ARTICLE_TRIAGE_PROMPT.format(articles_text=articles_text)

    for attempt in range(3):
        try:
            text = model.generate_content(prompt).text.strip()
            results = _parse_triage_response(text, articles)
            h = sum(1 for r in results if "🟢" in r["triage"])
            m = sum(1 for r in results if "🟡" in r["triage"])
            print(f"  ✅ Newslettery: 🟢 {h} | 🟡 {m} | 🔴 {len(results)-h-m}")
            return results
        except Exception as e:
            if "429" in str(e) and attempt < 2:
                wait = (attempt + 1) * 20
                print(f"  ⏳ Rate limit, čekám {wait}s...")
                time.sleep(wait)
            else:
                print(f"  ⚠️ Newsletter triage error: {e} – fallback na keyword scoring")
                return _parse_triage_response("", articles)
    return _parse_triage_response("", articles)


if __name__ == "__main__":
    # Smoke test
    arts = process_newsletters()
    print(f"\n📊 Celkem {len(arts)} článků:")
    for a in sorted(arts, key=lambda x: x["score"], reverse=True):
        print(f"  {a['triage']} {a['score']}/10 | {a['title'][:60]} | {a['channel']}")
