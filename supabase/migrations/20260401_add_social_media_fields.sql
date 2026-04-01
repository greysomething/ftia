-- Add social media fields to production_crew_roles and production_company_links
-- Also add instagram and website to companies table (crew_members already has them)

ALTER TABLE production_crew_roles
  ADD COLUMN IF NOT EXISTS inline_twitter text,
  ADD COLUMN IF NOT EXISTS inline_instagram text,
  ADD COLUMN IF NOT EXISTS inline_website text;

ALTER TABLE production_company_links
  ADD COLUMN IF NOT EXISTS inline_twitter text,
  ADD COLUMN IF NOT EXISTS inline_instagram text,
  ADD COLUMN IF NOT EXISTS inline_website text;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS website text;
