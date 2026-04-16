-- Slug redirects: when two productions are merged, the loser's slug points
-- to the winner's slug so old URLs keep working (301).
-- Generic by entity_type so we can reuse for crew/companies later.
CREATE TABLE IF NOT EXISTS slug_redirects (
  id BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,           -- 'production' | 'company' | 'crew'
  old_slug TEXT NOT NULL,
  new_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (entity_type, old_slug)
);

CREATE INDEX IF NOT EXISTS slug_redirects_lookup_idx
  ON slug_redirects (entity_type, old_slug);

-- Audit + undo log for production merges. Stores a full snapshot of the
-- losing production (the "merged" one) and its relations so we can restore.
CREATE TABLE IF NOT EXISTS production_merge_log (
  id BIGSERIAL PRIMARY KEY,
  kept_id INTEGER NOT NULL REFERENCES productions(id) ON DELETE SET NULL,
  merged_id INTEGER NOT NULL,          -- intentionally NOT a FK: this row may be hard-deleted
  merged_snapshot JSONB NOT NULL,      -- full snapshot of merged production + all relations
  field_choices JSONB NOT NULL,        -- which fields were picked from where
  merged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  merged_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  undone_at TIMESTAMPTZ,
  undone_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS production_merge_log_kept_idx
  ON production_merge_log (kept_id);
CREATE INDEX IF NOT EXISTS production_merge_log_recent_idx
  ON production_merge_log (merged_at DESC);

-- Lock these tables down. Only service role (admin endpoints) reads/writes.
ALTER TABLE slug_redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_merge_log ENABLE ROW LEVEL SECURITY;

-- Public can read slug_redirects (needed by the production page lookup)
CREATE POLICY "slug_redirects_public_read"
  ON slug_redirects FOR SELECT
  USING (true);
