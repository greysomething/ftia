-- Store Stripe configuration in the database so admin can toggle test/live mode
-- without redeploying
CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: only service role can read/write (admin endpoints use createAdminClient)
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;
-- No policies = no public access; service role bypasses RLS
