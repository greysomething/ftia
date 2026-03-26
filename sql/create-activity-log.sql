-- Activity Log table for tracking user logins, actions, and security events
CREATE TABLE IF NOT EXISTS activity_log (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  email TEXT,
  event_type TEXT NOT NULL DEFAULT 'login',
  ip_address INET,
  user_agent TEXT,
  country TEXT,
  city TEXT,
  region TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX idx_activity_log_user_id ON activity_log(user_id);
CREATE INDEX idx_activity_log_event_type ON activity_log(event_type);
CREATE INDEX idx_activity_log_created_at ON activity_log(created_at DESC);
CREATE INDEX idx_activity_log_email ON activity_log(email);

-- RLS: only service role can insert/read (no user access)
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- Allow service role full access (bypasses RLS anyway, but explicit)
CREATE POLICY "Service role full access" ON activity_log
  FOR ALL USING (true) WITH CHECK (true);
