-- Track production search clicks for Trending Searches widget
CREATE TABLE IF NOT EXISTS search_clicks (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  production_id integer REFERENCES productions(id) ON DELETE CASCADE,
  production_title text NOT NULL,
  production_slug text NOT NULL,
  search_query text,
  clicked_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_search_clicks_production ON search_clicks(production_id);
CREATE INDEX IF NOT EXISTS idx_search_clicks_date ON search_clicks(clicked_at);

-- Enable RLS but allow inserts from anon (tracking) and reads from service role
ALTER TABLE search_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anonymous inserts" ON search_clicks
  FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Allow service role reads" ON search_clicks
  FOR SELECT TO service_role USING (true);

CREATE POLICY "Allow authenticated reads" ON search_clicks
  FOR SELECT TO authenticated USING (true);
