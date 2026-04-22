-- Discovery pipeline: RSS feed monitoring + AI extraction → draft productions.
--
-- Two cron jobs work this pipeline:
--   1. discovery-poll   — fetches enabled sources, inserts new items
--   2. discovery-extract — calls Claude+web-search on pending items, creates drafts
--
-- Items live in discovery_items with status flags. A "score" is recorded on
-- each extracted item; below the configured threshold it stays in the queue
-- for manual review, above it auto-creates a draft production.

-- ─────────────────────────────────────────────────────────────────────────────
-- Sources (admin-managed feeds)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discovery_sources (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  url             TEXT NOT NULL,
  source_type     TEXT NOT NULL DEFAULT 'rss' CHECK (source_type IN ('rss','atom')),
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  last_polled_at  TIMESTAMPTZ,
  last_error      TEXT,
  success_count   INTEGER NOT NULL DEFAULT 0,
  failure_count   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (url)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Items discovered from sources
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discovery_items (
  id                    BIGSERIAL PRIMARY KEY,
  source_id             INTEGER REFERENCES discovery_sources(id) ON DELETE SET NULL,
  external_id           TEXT NOT NULL,                    -- guid/link from feed
  title                 TEXT NOT NULL,
  link                  TEXT,
  summary               TEXT,
  published_at          TIMESTAMPTZ,
  raw_data              JSONB,                            -- raw RSS item for debugging
  status                TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN (
      'new',           -- just polled, not yet processed
      'filtered_out',  -- doesn't look production-related
      'duplicate',     -- title matches an existing production
      'extracting',    -- in flight
      'extracted',     -- extraction done, score below threshold (queue)
      'created',       -- draft production created
      'error',         -- extraction failed
      'skipped'        -- admin marked as not relevant
    )),
  duplicate_of          BIGINT REFERENCES productions(id) ON DELETE SET NULL,
  production_id         BIGINT REFERENCES productions(id) ON DELETE SET NULL,
  extraction_score      INTEGER,                          -- 0–100 verifiability
  extraction_data       JSONB,                            -- full extracted draft + report
  error                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at          TIMESTAMPTZ,
  UNIQUE (source_id, external_id)
);

CREATE INDEX IF NOT EXISTS idx_discovery_items_status ON discovery_items(status);
CREATE INDEX IF NOT EXISTS idx_discovery_items_created ON discovery_items(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_discovery_items_pending
  ON discovery_items(created_at DESC) WHERE status = 'new';

-- ─────────────────────────────────────────────────────────────────────────────
-- Settings (key/value, same pattern as blog_generation_settings)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS discovery_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO discovery_settings (key, value) VALUES
  ('enabled',                'true'),
  ('extraction_enabled',     'true'),
  ('extraction_batch_size',  '5'),
  ('extraction_daily_cap',   '30'),       -- max extractions per UTC day
  ('extraction_threshold',   '85'),       -- ≥ this → auto-create draft
  ('dedup_threshold',        '85'),       -- title-match similarity for duplicate detection
  ('keyword_filter',         '[]')         -- optional title/summary keyword filters; [] means accept all
ON CONFLICT (key) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- Pre-populated trade publication sources
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO discovery_sources (name, url, source_type) VALUES
  ('Variety — Film',                 'https://variety.com/v/film/feed/',                 'rss'),
  ('Variety — TV',                   'https://variety.com/v/tv/feed/',                   'rss'),
  ('Deadline — Film',                'https://deadline.com/v/film/feed/',                'rss'),
  ('Deadline — TV',                  'https://deadline.com/v/tv/feed/',                  'rss'),
  ('The Hollywood Reporter — Movies','https://www.hollywoodreporter.com/c/movies/feed/', 'rss'),
  ('The Hollywood Reporter — TV',    'https://www.hollywoodreporter.com/c/tv/feed/',     'rss')
ON CONFLICT (url) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS — admin endpoints use service role, public has no access.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE discovery_sources  ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery_settings ENABLE ROW LEVEL SECURITY;
