-- Track which productions appear in each weekly list.
-- A production can appear in multiple weeks (it stays in old weeks even after being updated).
CREATE TABLE IF NOT EXISTS production_week_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  production_id integer NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  week_monday date NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(production_id, week_monday)
);

CREATE INDEX IF NOT EXISTS idx_pwe_week ON production_week_entries(week_monday);
CREATE INDEX IF NOT EXISTS idx_pwe_production ON production_week_entries(production_id);

-- RLS
ALTER TABLE production_week_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read week entries" ON production_week_entries
  FOR SELECT USING (true);

CREATE POLICY "Service role can manage week entries" ON production_week_entries
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ─── Backfill ───────────────────────────────────────────────────────────────
-- For each published production, create an entry for every week between its
-- WordPress creation date and its last WordPress update date.
-- This gives a realistic historical picture: a production that was created in
-- January and last updated in March will appear in every weekly list from Jan–Mar.
-- PostgreSQL date_trunc('week', ...) returns Monday (ISO week start).
INSERT INTO production_week_entries (production_id, week_monday)
SELECT
  p.id,
  gs::date AS week_monday
FROM productions p
CROSS JOIN LATERAL generate_series(
  date_trunc('week', COALESCE(p.wp_created_at, p.created_at)),
  date_trunc('week', COALESCE(p.wp_updated_at, p.created_at)),
  '1 week'::interval
) AS gs
WHERE p.visibility = 'publish'
  AND (p.wp_updated_at IS NOT NULL OR p.wp_created_at IS NOT NULL)
ON CONFLICT DO NOTHING;
