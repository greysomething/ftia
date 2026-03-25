CREATE TABLE IF NOT EXISTS email_template_overrides (
  slug text PRIMARY KEY,
  subject_override text,        -- null = use default
  html_override text,           -- null = use default
  is_active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE email_template_overrides ENABLE ROW LEVEL SECURITY;
