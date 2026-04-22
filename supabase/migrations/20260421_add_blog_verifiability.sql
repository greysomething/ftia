-- Verifiability scoring for AI-generated blog posts.
-- Each post can be fact-checked by a second Claude call with web search,
-- producing a 0–100 score and per-claim report. Posts below the configured
-- threshold are automatically discarded (moved to trash).

ALTER TABLE blog_posts
  ADD COLUMN IF NOT EXISTS verifiability_score INTEGER,
  ADD COLUMN IF NOT EXISTS verifiability_report JSONB,
  ADD COLUMN IF NOT EXISTS verifiability_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_blog_verifiability_score
  ON blog_posts (verifiability_score)
  WHERE verifiability_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_blog_ai_generated
  ON blog_posts (ai_generated)
  WHERE ai_generated = TRUE;

-- Backfill: mark all blog posts that have an entry in blog_generation_queue
-- (linked via blog_post_id) as ai_generated so we can target them for backfill.
UPDATE blog_posts bp
SET ai_generated = TRUE
WHERE EXISTS (
  SELECT 1 FROM blog_generation_queue q
  WHERE q.blog_post_id = bp.id
);

-- Settings keys for the verifiability pipeline
INSERT INTO blog_generation_settings (key, value) VALUES
  ('verifiability_enabled',   'true'),
  ('verifiability_threshold', '85'),
  ('verifiability_action',    'discard')
ON CONFLICT (key) DO NOTHING;
