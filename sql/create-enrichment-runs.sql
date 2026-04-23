-- Audit log for nightly AI enrichment runs.
-- Each row = one entity processed (company or crew member). The cron handler
-- inserts one row per attempt — successful, skipped (high-confidence threshold
-- failed), or errored — so the admin dashboard can show "what changed last
-- night" and surface failures.
--
-- Companion to:
--   • add-last-enriched-at.sql (per-row timestamps)
--   • site_settings key='enrichment_config' (cadence + batch size + targets)
--   • /api/cron/enrich-profiles (writer)
--   • /admin/enrichment dashboard (reader)
--
-- Safe to re-run.

CREATE TABLE IF NOT EXISTS enrichment_runs (
  id              BIGSERIAL PRIMARY KEY,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at     TIMESTAMPTZ,
  entity_type     TEXT NOT NULL CHECK (entity_type IN ('company', 'crew')),
  entity_id       BIGINT NOT NULL,
  entity_name     TEXT,                       -- snapshot for display even if entity later renamed/deleted
  fields_updated  INT NOT NULL DEFAULT 0,
  confidence_avg  NUMERIC(4,3),               -- 0.000–1.000 mean of accepted field confidences
  status          TEXT NOT NULL CHECK (status IN ('updated', 'skipped', 'error')),
  error           TEXT,
  triggered_by    TEXT NOT NULL DEFAULT 'cron' -- 'cron' | 'manual' (in case admin triggers a backfill)
);

CREATE INDEX IF NOT EXISTS idx_enrichment_runs_started_at ON enrichment_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_enrichment_runs_entity     ON enrichment_runs (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_enrichment_runs_status     ON enrichment_runs (status);

-- Auto-prune rows older than 90 days via a scheduled DELETE in the cron itself
-- (keep the table lean; we display "last 30 days" in the dashboard anyway).
