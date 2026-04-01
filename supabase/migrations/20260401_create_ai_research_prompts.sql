CREATE TABLE IF NOT EXISTS ai_research_prompts (
  id serial PRIMARY KEY,
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  system_prompt text,
  model text,
  max_tokens integer,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE ai_research_prompts ENABLE ROW LEVEL SECURITY;

INSERT INTO ai_research_prompts (slug, name) VALUES
  ('production', 'Production Research'),
  ('company', 'Company Research'),
  ('crew', 'Crew/Person Research')
ON CONFLICT (slug) DO NOTHING;
