-- Add 'trash' to the post_visibility enum so soft-delete works
ALTER TYPE post_visibility ADD VALUE IF NOT EXISTS 'trash';
