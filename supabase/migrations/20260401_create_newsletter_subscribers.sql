-- Store newsletter subscribers locally so digest sends don't depend on
-- paginating through 22K+ contacts via the Resend API.

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  id serial PRIMARY KEY,
  email text UNIQUE NOT NULL,
  first_name text,
  last_name text,
  unsubscribed boolean NOT NULL DEFAULT false,
  source text DEFAULT 'website',  -- 'website', 'register', 'admin', 'backfill'
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_newsletter_subscribers_email ON newsletter_subscribers (email);
CREATE INDEX idx_newsletter_subscribers_active ON newsletter_subscribers (unsubscribed) WHERE unsubscribed = false;

ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
