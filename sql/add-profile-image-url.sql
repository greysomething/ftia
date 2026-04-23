-- Add a profile photo URL column for crew members.
-- Manual uploads land here; if blank, the app falls back to unavatar.io
-- using the LinkedIn slug at render time (see src/lib/crew-avatar.ts).

ALTER TABLE crew_members
  ADD COLUMN IF NOT EXISTS profile_image_url TEXT;

COMMENT ON COLUMN crew_members.profile_image_url IS
  'Optional manually-curated headshot URL (typically uploaded to Supabase Storage). When NULL, the app falls back to unavatar.io if a LinkedIn URL is set.';
