-- Email logs table for tracking all outgoing transactional emails
CREATE TABLE IF NOT EXISTS email_logs (
  id            uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient     text NOT NULL,
  subject       text NOT NULL,
  template_slug text,          -- e.g. 'welcome', 'password-reset', etc.
  status        text NOT NULL DEFAULT 'sent',  -- sent | delivered | bounced | failed
  resend_id     text,          -- Resend email ID for cross-referencing
  error_message text,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for filtering by status and template
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON email_logs (status);
CREATE INDEX IF NOT EXISTS idx_email_logs_template ON email_logs (template_slug);
CREATE INDEX IF NOT EXISTS idx_email_logs_sent_at ON email_logs (sent_at DESC);

-- RLS: only service role should access this table (admin operations only)
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- No public policies — only service_role key can read/write
