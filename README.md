# 🧠 YT Brain — YouTube Knowledge Pipeline

Next.js app pro extrakci znalostí z YouTube videí do Second Brain (Notion).

## Stack
- **Frontend**: Next.js 15 (App Router) + TypeScript
- **Database**: Neon.tech (serverless Postgres)
- **AI**: Claude Haiku (~$0.001 per video)
- **Hosting**: Vercel (free tier)
- **Transcript**: `youtube-transcript` (zdarma, bez API klíče)

## Jak to funguje

```
YouTube URL → stáhnout transcript (FREE) → uložit do Neon DB
  → kliknout "⚡ Summarize" → Claude Haiku → TL;DR + insights + P.A.R.A. → DB
```

## Setup

```bash
git clone https://github.com/IvanekLumberjack888/yt-brain
cd yt-brain
npm install
cp .env.local.example .env.local
# Vyplň DATABASE_URL a ANTHROPIC_API_KEY
node src/lib/db-migrate.js   # init DB (jednou)
npm run dev
```

Otevři http://localhost:3000

## Ceny
| Operace | Cena |
|---------|------|
| Fetch transcript | $0 |
| Claude Haiku summary | ~$0.001 |
| Neon DB (free tier) | $0 |
| Vercel hosting | $0 |

24 videí = ~$0.024 (méně než 1 Kč)
