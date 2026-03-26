-- Add featured_image_url column for directly uploaded blog post images
-- (as opposed to thumbnail_id which references the media table for WP-migrated images)
ALTER TABLE blog_posts ADD COLUMN IF NOT EXISTS featured_image_url TEXT;
