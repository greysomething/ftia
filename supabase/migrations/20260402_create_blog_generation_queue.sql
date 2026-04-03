-- Blog generation queue: tracks which productions need blog posts generated
CREATE TABLE IF NOT EXISTS blog_generation_queue (
  id BIGSERIAL PRIMARY KEY,
  production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'generating', 'completed', 'failed', 'skipped')),
  blog_post_id BIGINT REFERENCES blog_posts(id) ON DELETE SET NULL,
  error TEXT,
  attempts INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (production_id)
);

-- Blog generation settings: admin-configurable parameters
CREATE TABLE IF NOT EXISTS blog_generation_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Default settings
INSERT INTO blog_generation_settings (key, value) VALUES
  ('enabled', 'true'),
  ('posts_per_day', '1.5'),
  ('auto_publish', 'false'),
  ('min_production_data_score', '3'),
  ('exclude_types', '[]'),
  ('batch_size', '2')
ON CONFLICT (key) DO NOTHING;

-- Index for cron queries
CREATE INDEX IF NOT EXISTS idx_blog_gen_queue_status ON blog_generation_queue(status);
CREATE INDEX IF NOT EXISTS idx_blog_gen_queue_created ON blog_generation_queue(created_at DESC);
