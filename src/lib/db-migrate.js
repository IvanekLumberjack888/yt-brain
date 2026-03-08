// Run: node src/lib/db-migrate.js
require('dotenv').config({ path: '.env.local' })
const { neon } = require('@neondatabase/serverless')

const sql = neon(process.env.DATABASE_URL)

async function migrate() {
  console.log('🔄 Running DB migration...')
  await sql`
    CREATE TABLE IF NOT EXISTS videos (
      id              SERIAL PRIMARY KEY,
      youtube_url     TEXT UNIQUE NOT NULL,
      video_id        VARCHAR(11) NOT NULL,
      title           TEXT,
      channel         TEXT,
      transcript      TEXT,
      transcript_lang VARCHAR(10) DEFAULT 'en',
      summary         TEXT,
      insights        JSONB,
      tags            TEXT[],
      notion_id       TEXT,
      priority        VARCHAR(20) DEFAULT 'medium',
      status          VARCHAR(20) DEFAULT 'to_watch',
      created_at      TIMESTAMPTZ DEFAULT NOW(),
      processed_at    TIMESTAMPTZ,
      CONSTRAINT valid_priority CHECK (priority IN ('high', 'medium', 'low')),
      CONSTRAINT valid_status   CHECK (status IN ('to_watch', 'in_progress', 'done', 'skip'))
    )
  `
  await sql`CREATE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id)`
  await sql`CREATE INDEX IF NOT EXISTS idx_videos_status   ON videos(status)`
  await sql`CREATE INDEX IF NOT EXISTS idx_videos_priority ON videos(priority)`
  await sql`CREATE INDEX IF NOT EXISTS idx_videos_created  ON videos(created_at DESC)`
  console.log('✅ Migration complete!')
  process.exit(0)
}

migrate().catch((err) => { console.error('❌ Migration failed:', err.message); process.exit(1) })
