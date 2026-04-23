-- Track when AI enrichment last ran on each company / crew member.
-- Used by:
--   • The "Enrich with AI" admin button to show staleness ("Last enriched: 3 days ago")
--   • A future nightly cron to skip records that were enriched within the last 30 days
--
-- Safe to re-run.

ALTER TABLE companies     ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;
ALTER TABLE crew_members  ADD COLUMN IF NOT EXISTS last_enriched_at TIMESTAMPTZ;

-- Index helps the future cron quickly find stale records.
CREATE INDEX IF NOT EXISTS idx_companies_last_enriched_at    ON companies(last_enriched_at);
CREATE INDEX IF NOT EXISTS idx_crew_members_last_enriched_at ON crew_members(last_enriched_at);
