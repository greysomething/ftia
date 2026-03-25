-- Add extended fields to crew_members for bio, roles, credits, and representation
-- These were available in the legacy WP site but missing from the new schema

ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS content TEXT;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS imdb TEXT;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS instagram TEXT;
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS roles JSONB DEFAULT '[]';
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS known_for JSONB DEFAULT '[]';
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS representation JSONB DEFAULT '{}';
ALTER TABLE crew_members ADD COLUMN IF NOT EXISTS location TEXT;
