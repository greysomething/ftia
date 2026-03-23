-- Add is_supplement flag to weekly list entries
-- Supplements are auto-added productions (from older lists, still filming)
-- vs. admin-curated new productions for the week.
ALTER TABLE production_week_entries
  ADD COLUMN IF NOT EXISTS is_supplement boolean DEFAULT false;
