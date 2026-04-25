-- ============================================================
-- Pitch Marketplace Tables
-- Run this in Supabase SQL Editor
-- ============================================================

-- Enum for pitch format
CREATE TYPE pitch_format AS ENUM (
  'feature-film', 'tv-pilot', 'tv-series', 'limited-series',
  'documentary', 'short-film', 'book-ip'
);

-- Enum for budget range
CREATE TYPE pitch_budget_range AS ENUM (
  'micro', 'low', 'mid', 'high', 'tentpole'
);

-- Enum for development stage
CREATE TYPE pitch_development_stage AS ENUM (
  'concept', 'treatment', 'script-in-progress',
  'script-complete', 'package-attached'
);

-- Pitch genres (taxonomy table)
CREATE TABLE pitch_genres (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   INT REFERENCES pitch_genres(id),
  description TEXT,
  sort_order  INT DEFAULT 0
);

-- Seed genres
INSERT INTO pitch_genres (name, slug, sort_order) VALUES
  ('Action', 'action', 1),
  ('Comedy', 'comedy', 2),
  ('Drama', 'drama', 3),
  ('Horror', 'horror', 4),
  ('Sci-Fi', 'sci-fi', 5),
  ('Thriller', 'thriller', 6),
  ('Romance', 'romance', 7),
  ('Documentary', 'documentary', 8),
  ('Animation', 'animation', 9),
  ('Fantasy', 'fantasy', 10),
  ('Crime', 'crime', 11),
  ('Family', 'family', 12),
  ('Mystery', 'mystery', 13),
  ('Western', 'western', 14),
  ('Musical', 'musical', 15),
  ('War', 'war', 16),
  ('Biography', 'biography', 17),
  ('Historical', 'historical', 18),
  ('Sports', 'sports', 19),
  ('Faith-Based', 'faith-based', 20);

-- Main pitches table
CREATE TABLE pitches (
  id                  BIGSERIAL PRIMARY KEY,
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title               TEXT NOT NULL,
  slug                TEXT NOT NULL UNIQUE,
  logline             TEXT NOT NULL,
  synopsis            TEXT,
  format              pitch_format NOT NULL,
  budget_range        pitch_budget_range,
  development_stage   pitch_development_stage NOT NULL DEFAULT 'concept',
  target_audience     TEXT,
  comparable_titles   TEXT,
  unique_selling_points TEXT,
  visibility          post_visibility NOT NULL DEFAULT 'draft',
  featured            BOOLEAN NOT NULL DEFAULT false,
  view_count          INT NOT NULL DEFAULT 0,
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Junction: pitch <-> genres (many-to-many)
CREATE TABLE pitch_genre_links (
  pitch_id   BIGINT NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  genre_id   INT NOT NULL REFERENCES pitch_genres(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (pitch_id, genre_id)
);

-- Pitch attachments (scripts, pitch decks — PDF only)
CREATE TABLE pitch_attachments (
  id           BIGSERIAL PRIMARY KEY,
  pitch_id     BIGINT NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type    TEXT NOT NULL DEFAULT 'other',
  mime_type    TEXT NOT NULL DEFAULT 'application/pdf',
  file_size    INT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Pitch favorites (bookmarks by other users)
CREATE TABLE pitch_favorites (
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pitch_id   BIGINT NOT NULL REFERENCES pitches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, pitch_id)
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_pitches_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER pitches_updated_at
  BEFORE UPDATE ON pitches
  FOR EACH ROW EXECUTE FUNCTION update_pitches_updated_at();

-- Indexes
CREATE INDEX idx_pitches_user_id ON pitches(user_id);
CREATE INDEX idx_pitches_visibility ON pitches(visibility);
CREATE INDEX idx_pitches_format ON pitches(format);
CREATE INDEX idx_pitches_slug ON pitches(slug);
CREATE INDEX idx_pitches_featured ON pitches(featured) WHERE featured = true;
CREATE INDEX idx_pitches_published_at ON pitches(published_at DESC);
CREATE INDEX idx_pitch_genre_links_genre ON pitch_genre_links(genre_id);
CREATE INDEX idx_pitch_attachments_pitch ON pitch_attachments(pitch_id);
CREATE INDEX idx_pitch_favorites_pitch ON pitch_favorites(pitch_id);

-- ============================================================
-- RLS POLICIES
-- ============================================================

ALTER TABLE pitches ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_genres ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_genre_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE pitch_favorites ENABLE ROW LEVEL SECURITY;

-- Genres: public read
CREATE POLICY "pitch_genres_public_read" ON pitch_genres
  FOR SELECT USING (true);

-- Pitches: published readable by anyone
CREATE POLICY "pitches_published_read" ON pitches
  FOR SELECT USING (visibility = 'publish');

-- Pitches: owners can read their own (any visibility)
CREATE POLICY "pitches_own_read" ON pitches
  FOR SELECT USING (user_id = auth.uid());

-- Pitches: owners can insert
CREATE POLICY "pitches_own_insert" ON pitches
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Pitches: owners can update their own
CREATE POLICY "pitches_own_update" ON pitches
  FOR UPDATE USING (user_id = auth.uid());

-- Pitches: owners can delete their own
CREATE POLICY "pitches_own_delete" ON pitches
  FOR DELETE USING (user_id = auth.uid());

-- Genre links: public read
CREATE POLICY "pitch_genre_links_public_read" ON pitch_genre_links
  FOR SELECT USING (true);

-- Genre links: owners can manage via pitch ownership
CREATE POLICY "pitch_genre_links_own_insert" ON pitch_genre_links
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM pitches WHERE id = pitch_id AND user_id = auth.uid())
  );

CREATE POLICY "pitch_genre_links_own_delete" ON pitch_genre_links
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM pitches WHERE id = pitch_id AND user_id = auth.uid())
  );

-- Attachments: readable for published pitches or own
CREATE POLICY "pitch_attachments_read" ON pitch_attachments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM pitches WHERE id = pitch_id AND (visibility = 'publish' OR user_id = auth.uid()))
  );

-- Attachments: owners can manage
CREATE POLICY "pitch_attachments_own_insert" ON pitch_attachments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "pitch_attachments_own_delete" ON pitch_attachments
  FOR DELETE USING (user_id = auth.uid());

-- Favorites: own read/insert/delete
CREATE POLICY "pitch_favorites_own_read" ON pitch_favorites
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "pitch_favorites_own_insert" ON pitch_favorites
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "pitch_favorites_own_delete" ON pitch_favorites
  FOR DELETE USING (user_id = auth.uid());

-- ============================================================
-- STORAGE POLICIES (for pitches/ folder in media bucket)
-- ============================================================
-- Note: These may need to be run separately if the media bucket
-- policies are managed via Supabase Dashboard.

-- Allow authenticated users to upload to their own pitches folder
CREATE POLICY "pitch_uploads_own_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'pitches'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );

-- Allow public read of pitch files
CREATE POLICY "pitch_files_public_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'pitches'
  );

-- Allow users to delete their own pitch files
CREATE POLICY "pitch_uploads_own_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'media'
    AND (storage.foldername(name))[1] = 'pitches'
    AND (storage.foldername(name))[2] = auth.uid()::text
  );
