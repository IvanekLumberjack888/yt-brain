# CLAUDE.md — yt-brain

---

## 1. Project Overview

I'm Ivo. Junior Data Engineer at Konica Minolta (Azure stack). Building a personal YouTube-to-knowledge pipeline.

- **Repo**: `yt-brain` (private, GitHub: IvanekLumberjack888)
- **Stack**: Next.js + Neon Postgres + Claude Haiku + yt-dlp
- **Goal**: Auto-process videos from 🧠 FEED playlist → transcripts → summaries → Notion PARA
- **Second brain**: Notion (P.A.R.A. structure) + Claude via MCP

## 2. Tools & Stack

- **Neon Postgres** — main DB (pgvector enabled)
- **Claude Haiku** — transcript summarization (cheap, fast)
- **Claude Sonnet** — reduce step + PARA classification
- **yt-dlp** — transcript extraction (cookie support, anti-blocking)
- **GitHub Actions** — playlist monitoring (cron), queues new videos to `data/queue.json`
- **Notion MCP** — push summaries to workspace
- **Vercel** — hosting + Cron Jobs (weekly automation)
- **Ollama** — local fallback (tinyllama, phi3:mini, mistral) — slow, no GPU

## 3. How Things Work

**Main pipeline**: GitHub Actions monitors playlist → new videos → `data/queue.json` → `brain/process_queue.py` fetches transcripts (yt-dlp) → chunks → map-reduce summarization → pgvector embed → push to Notion

**Transcript extraction**: yt-dlp primary (`--skip-download --write-auto-subs --sub-langs "cs,sk,en"`), youtube-transcript-api fallback

**Notion sync**: PARA classification via Claude (Projects/Areas/Resources/Archives) → create page in correct DB

**Branch protection**: main is protected — always work via branch + PR

## 4. What I'm Working On

- Rewrite `brain/process_queue.py` to yt-dlp backend (replace browser-cookie3 code)
- Add pgvector semantic search (Neon, `CREATE EXTENSION vector;`)
- Add Vercel Cron Jobs for weekly automation
- Add map-reduce summarization (Haiku MAP → Sonnet REDUCE)
- LLM-driven Notion PARA classification

Current blockers: 4 cs/sk videos failing on transcript fetch (YouTube IP blocks) → yt-dlp fix

## 5. Rules

**Always:**
- Read relevant skill doc in `skills/` before any multi-step task
- Work via branch + PR (never push directly to main)
- Use absolute paths for Windows tools (Python, yt-dlp, git)
- Run end-to-end without pausing for approval unless something is genuinely unclear
- Be direct, concise
- When blocked, try 2–3 approaches before giving up

**Never:**
- Push API keys to repo — revoke immediately if leaked
- Improvise a process when a skill doc exists
- Change something working without asking first
- Install packages globally without checking venv state

---

# Reference — Operational Details

Claude reads this section when executing specific tasks, not on every message.

---

## Core Role: Process Engineering

Primary job: make every process as good as it can be.

1. **End-of-session processizing**: At the end of every chat, proactively identify anything we did manually that could become a documented SOP, script, or automation. Ask: "Chceš to processize?"
2. **Process improvement suggestions**: When an existing process could be faster/more reliable, suggest it AND log it to the relevant skill doc's `## Feedback Log` section.

## "Ulož" / "Save" Command

When I say **"ulož"**, **"save"**, or **"save it"**:
1. Update the relevant skill doc in `skills/` — capture exact commands, output format, lessons learned
2. Update CLAUDE.md if a new skill was created (add to Skills-First list below)
3. Update `MEMORY.md` if stable patterns or conventions changed

NOT about git commits — about persisting process knowledge for future sessions.

## Skills-First Directive

Before starting ANY pipeline, process, or multi-step task, ALWAYS read the relevant `skills/` doc first. Follow it exactly. Available skills:

- `YT_DLP_TRANSCRIPT_SOP.md` — yt-dlp transcript extraction, language fallback, cs/sk handling
- `QUEUE_PROCESSING_SOP.md` — process_queue.py workflow, chunking, map-reduce
- `NOTION_PARA_SYNC_SOP.md` — push summaries to Notion, PARA classification prompts
- `PGVECTOR_SETUP_SOP.md` — Neon pgvector setup, embedding, hybrid search
- `GITHUB_ACTIONS_SOP.md` — playlist monitoring workflow, queue.json format
- `VERCEL_CRON_SOP.md` — weekly automation setup

If a task touches multiple skills, read ALL relevant docs before starting.

## Key Architecture

```
yt-brain/
  brain/
    process_queue.py      ← main processing script
    summarize.py          ← map-reduce with Haiku/Sonnet
    embed.py              ← pgvector embeddings
    notion_push.py        ← Notion PARA sync
  data/
    queue.json            ← pending videos (added by GitHub Actions)
  skills/                 ← SOPs (read before any task)
  .github/
    workflows/
      monitor_playlist.yml  ← cron job, checks 🧠 FEED
  MEMORY.md               ← stable patterns across sessions
  CLAUDE.md               ← this file
```

## Autoresearch Loop (TODO — implement in v2)

Inspired by Karpathy's autoresearch + AI Andy's Content Mate v2.1:
- Score each video (0–8) BEFORE processing (topic relevance, channel weight, title quality)
- Only highest-scoring videos enter pipeline
- Track: predicted score vs. actually used in Notion
- Claude rewrites scoring prompt based on feedback
- Your Approve/Deny in Notion trains the scoring model

## Conventions

- Transcripts: prefer `cs`, fallback `sk`, fallback `en`
- Chunk size: ~4000 tokens, timestamp-aware
- Map step: Claude Haiku (~$0.03/video)
- Reduce step: Claude Sonnet (~$0.12/video)
- Total cost target: <$0.20 per 2h video
- Notion DB IDs:
  - YouTube Queue: `ff72bf7b-1fc0-4b0e-b011-02bee2595c67`
  - AI Digest: `5626400c-9407-45e0-b123-6817847e89f6`
- Windows: use absolute paths for yt-dlp (`$env:LOCALAPPDATA\...\Scripts\yt-dlp.exe`)

## Session Log

At end of every conversation, append short dated summary (3–5 bullets) to `MEMORY.md`.