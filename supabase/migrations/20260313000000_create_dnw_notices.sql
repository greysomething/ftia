-- Create DNW (Do Not Work) Notices table
CREATE TABLE IF NOT EXISTS dnw_notices (
  id                BIGSERIAL PRIMARY KEY,
  production_title  TEXT NOT NULL,
  company_name      TEXT NOT NULL,
  reason            TEXT,
  details           TEXT,
  notice_date       DATE DEFAULT CURRENT_DATE,
  status            VARCHAR(20) DEFAULT 'active',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dnw_notices_status ON dnw_notices(status);
CREATE INDEX IF NOT EXISTS idx_dnw_notices_date ON dnw_notices(notice_date DESC);

-- RLS policies
ALTER TABLE dnw_notices ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read active notices
CREATE POLICY "Authenticated users can view active notices"
  ON dnw_notices FOR SELECT
  TO authenticated
  USING (status = 'active');

-- Allow service role full access (for admin operations)
CREATE POLICY "Service role has full access to dnw_notices"
  ON dnw_notices FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
