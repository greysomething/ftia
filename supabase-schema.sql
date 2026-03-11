-- ============================================================
-- ProductionList — Supabase / Postgres Schema
-- Migrated from WordPress (wp_ prefix) + Paid Memberships Pro
-- ============================================================
-- Run this in Supabase SQL Editor or via psql.
-- ============================================================

-- Enable pgcrypto for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE post_visibility AS ENUM ('publish', 'private', 'draft', 'password');
CREATE TYPE membership_status AS ENUM ('active', 'inactive', 'cancelled', 'expired', 'pending', 'token', 'review');
CREATE TYPE membership_period AS ENUM ('Day', 'Week', 'Month', 'Year');
CREATE TYPE production_phase AS ENUM (
  'in-pre-production',
  'in-production',
  'in-post-production',
  'completed'
);

-- ============================================================
-- LOOKUP / TAXONOMY TABLES
-- (Mirrors WP term/term_taxonomy structure, clean)
-- ============================================================

-- production-type taxonomy (Feature Film, TV Series, Pilot, etc.)
CREATE TABLE production_types (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   INT REFERENCES production_types(id),
  description TEXT,
  sort_order  INT DEFAULT 0
);

-- production-union taxonomy (Pre-production, Development, Casting, Production, etc.)
CREATE TABLE production_statuses (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order  INT DEFAULT 0
);

-- production-rcat taxonomy (Director, Producer, Writer, Casting Executive, etc.)
CREATE TABLE role_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   INT REFERENCES role_categories(id),
  description TEXT,
  sort_order  INT DEFAULT 0
);

-- production-ccat taxonomy (Production Company, Film Studio, Distributor, etc.)
CREATE TABLE company_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   INT REFERENCES company_categories(id),
  description TEXT,
  sort_order  INT DEFAULT 0
);

-- Blog categories (category taxonomy)
CREATE TABLE blog_categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  parent_id   INT REFERENCES blog_categories(id),
  description TEXT,
  sort_order  INT DEFAULT 0
);

-- Blog tags (post_tag taxonomy)
CREATE TABLE blog_tags (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  description TEXT
);

-- ============================================================
-- MEDIA
-- ============================================================

CREATE TABLE media (
  id             BIGSERIAL PRIMARY KEY,
  wp_id          INT,                    -- original wp_posts.ID for mapping
  filename       TEXT NOT NULL,
  storage_path   TEXT,                   -- Supabase Storage path
  original_url   TEXT,                   -- original WordPress URL
  mime_type      TEXT,
  alt_text       TEXT,
  title          TEXT,
  width          INT,
  height         INT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_wp_id ON media(wp_id);

-- ============================================================
-- PRODUCTIONS  (post_type = 'production')
-- ============================================================

CREATE TABLE productions (
  id                       BIGSERIAL PRIMARY KEY,
  wp_id                    INT UNIQUE,           -- wp_posts.ID for migration
  title                    TEXT NOT NULL,
  slug                     TEXT NOT NULL UNIQUE,
  content                  TEXT,                 -- post_content (description)
  excerpt                  TEXT,
  visibility               post_visibility DEFAULT 'publish',
  thumbnail_id             BIGINT REFERENCES media(id),

  -- Dates (stored as YYYYMMDD integers in WP, converted to DATE)
  production_date_start    DATE,
  production_date_end      DATE,
  production_date_startpost DATE,               -- post-production start
  production_date_endpost   DATE,               -- post-production end

  -- Legacy serialized fields (preserved from WP)
  -- contact meta can be array of contactIDs OR inline data
  -- roles meta can be array with rolenames/peoples OR inline data
  -- We migrate these into junction tables but keep raw for safety
  _raw_contact             JSONB,
  _raw_roles               JSONB,
  _raw_locations           JSONB,
  _raw_locations_new       JSONB,

  -- Computed / denormalised
  computed_status          production_phase DEFAULT 'in-pre-production',

  -- Blog post linked (blog_linked meta)
  blog_linked              BIGINT,

  -- WP metadata
  wp_author_id             INT,
  wp_created_at            TIMESTAMPTZ,
  wp_updated_at            TIMESTAMPTZ,
  created_at               TIMESTAMPTZ DEFAULT NOW(),
  updated_at               TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_productions_slug ON productions(slug);
CREATE INDEX idx_productions_visibility ON productions(visibility);
CREATE INDEX idx_productions_computed_status ON productions(computed_status);
CREATE INDEX idx_productions_wp_created ON productions(wp_created_at DESC);
CREATE INDEX idx_productions_date_start ON productions(production_date_start);

-- Production locations (normalized from serialized arrays)
CREATE TABLE production_locations (
  id            BIGSERIAL PRIMARY KEY,
  production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  location      TEXT NOT NULL,
  stage         TEXT,   -- locations_new has stage/city/country components
  city          TEXT,
  country       TEXT,
  sort_order    INT DEFAULT 0
);

CREATE INDEX idx_prod_locations_production ON production_locations(production_id);

-- Productions ↔ production_types (many-to-many)
CREATE TABLE production_type_links (
  production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  type_id       INT    NOT NULL REFERENCES production_types(id) ON DELETE CASCADE,
  is_primary    BOOLEAN DEFAULT FALSE,
  PRIMARY KEY   (production_id, type_id)
);

-- Productions ↔ production_statuses (many-to-many)
CREATE TABLE production_status_links (
  production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  status_id     INT    NOT NULL REFERENCES production_statuses(id) ON DELETE CASCADE,
  is_primary    BOOLEAN DEFAULT FALSE,
  PRIMARY KEY   (production_id, status_id)
);

-- ============================================================
-- PRODUCTION CONTACTS (companies)  post_type = 'production-contact'
-- ============================================================

CREATE TABLE companies (
  id             BIGSERIAL PRIMARY KEY,
  wp_id          INT UNIQUE,
  title          TEXT NOT NULL,            -- company name
  slug           TEXT NOT NULL UNIQUE,
  content        TEXT,
  thumbnail_id   BIGINT REFERENCES media(id),

  -- Contact info (serialized arrays in WP, stored as JSONB arrays)
  addresses      JSONB DEFAULT '[]',       -- array of address strings
  phones         JSONB DEFAULT '[]',       -- array of phone strings
  faxes          JSONB DEFAULT '[]',
  emails         JSONB DEFAULT '[]',

  -- Social
  linkedin       TEXT,
  twitter        TEXT,

  -- WP metadata
  visibility     post_visibility DEFAULT 'publish',
  wp_author_id   INT,
  wp_created_at  TIMESTAMPTZ,
  wp_updated_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_title ON companies(title);

-- Companies ↔ company_categories (many-to-many)
CREATE TABLE company_category_links (
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id INT    NOT NULL REFERENCES company_categories(id) ON DELETE CASCADE,
  is_primary  BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (company_id, category_id)
);

-- ============================================================
-- PRODUCTION ROLES (individual crew/cast)  post_type = 'production-role'
-- ============================================================

CREATE TABLE crew_members (
  id             BIGSERIAL PRIMARY KEY,
  wp_id          INT UNIQUE,
  name           TEXT NOT NULL,            -- post_title (person name)
  slug           TEXT NOT NULL UNIQUE,

  -- Contact info (serialized arrays in WP)
  emails         JSONB DEFAULT '[]',
  phones         JSONB DEFAULT '[]',

  -- Social
  linkedin       TEXT,
  twitter        TEXT,

  -- WP metadata
  visibility     post_visibility DEFAULT 'publish',
  wp_author_id   INT,
  wp_created_at  TIMESTAMPTZ,
  wp_updated_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_crew_slug ON crew_members(slug);
CREATE INDEX idx_crew_name ON crew_members(name);
CREATE INDEX idx_crew_linkedin ON crew_members(linkedin);

-- Crew ↔ role_categories (many-to-many)
CREATE TABLE crew_category_links (
  crew_id     BIGINT NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  category_id INT    NOT NULL REFERENCES role_categories(id) ON DELETE CASCADE,
  is_primary  BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (crew_id, category_id)
);

-- ============================================================
-- COMPANY ↔ CREW  (ACF 'staffs' repeater on production-contact)
-- company has staff members (crew) with a position
-- ============================================================

CREATE TABLE company_staff (
  id          BIGSERIAL PRIMARY KEY,
  company_id  BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  crew_id     BIGINT NOT NULL REFERENCES crew_members(id) ON DELETE CASCADE,
  position    TEXT,               -- ACF 'position' sub-field
  sort_order  INT DEFAULT 0,
  UNIQUE (company_id, crew_id)
);

CREATE INDEX idx_company_staff_company ON company_staff(company_id);
CREATE INDEX idx_company_staff_crew ON company_staff(crew_id);

-- ============================================================
-- PRODUCTION ↔ COMPANY LINKS
-- (from production 'contact' meta — new format has contactID references)
-- ============================================================

CREATE TABLE production_company_links (
  id            BIGSERIAL PRIMARY KEY,
  production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  company_id    BIGINT REFERENCES companies(id) ON DELETE SET NULL,
  -- For old-format inline data (no linked company record):
  inline_name    TEXT,
  inline_address TEXT,
  inline_phones  JSONB DEFAULT '[]',
  inline_faxes   JSONB DEFAULT '[]',
  inline_emails  JSONB DEFAULT '[]',
  inline_linkedin TEXT,
  sort_order     INT DEFAULT 0
);

CREATE INDEX idx_prod_company_production ON production_company_links(production_id);
CREATE INDEX idx_prod_company_company ON production_company_links(company_id);

-- ============================================================
-- PRODUCTION ↔ CREW ROLES
-- (from production 'roles' meta — new format has peopleID references)
-- ============================================================

CREATE TABLE production_crew_roles (
  id            BIGSERIAL PRIMARY KEY,
  production_id BIGINT NOT NULL REFERENCES productions(id) ON DELETE CASCADE,
  crew_id       BIGINT REFERENCES crew_members(id) ON DELETE SET NULL,
  role_name     TEXT NOT NULL,         -- e.g. "Director", "Producer", "Executive Producer"
  -- For inline (non-linked) entries:
  inline_name   TEXT,                  -- manually typed name
  inline_linkedin TEXT,
  inline_phones JSONB DEFAULT '[]',
  inline_emails JSONB DEFAULT '[]',
  sort_order    INT DEFAULT 0
);

CREATE INDEX idx_prod_crew_production ON production_crew_roles(production_id);
CREATE INDEX idx_prod_crew_crew ON production_crew_roles(crew_id);

-- ============================================================
-- PRODUCTION LISTS  (post_type = 'production-list')
-- Curated lists of productions
-- ============================================================

CREATE TABLE production_lists (
  id             BIGSERIAL PRIMARY KEY,
  wp_id          INT UNIQUE,
  title          TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  content        TEXT,
  excerpt        TEXT,
  thumbnail_id   BIGINT REFERENCES media(id),
  visibility     post_visibility DEFAULT 'publish',
  wp_created_at  TIMESTAMPTZ,
  wp_updated_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_prod_lists_slug ON production_lists(slug);

-- ============================================================
-- BLOG POSTS  (post_type = 'post')
-- ============================================================

CREATE TABLE blog_posts (
  id             BIGSERIAL PRIMARY KEY,
  wp_id          INT UNIQUE,
  title          TEXT NOT NULL,
  slug           TEXT NOT NULL UNIQUE,
  content        TEXT,
  excerpt        TEXT,
  thumbnail_id   BIGINT REFERENCES media(id),
  visibility     post_visibility DEFAULT 'publish',
  published_at   TIMESTAMPTZ,
  wp_author_id   INT,
  wp_created_at  TIMESTAMPTZ,
  wp_updated_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_blog_slug ON blog_posts(slug);
CREATE INDEX idx_blog_published ON blog_posts(published_at DESC);
CREATE INDEX idx_blog_visibility ON blog_posts(visibility);

-- Blog posts ↔ blog_categories
CREATE TABLE blog_post_categories (
  post_id     BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  category_id INT    NOT NULL REFERENCES blog_categories(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, category_id)
);

-- Blog posts ↔ blog_tags
CREATE TABLE blog_post_tags (
  post_id BIGINT NOT NULL REFERENCES blog_posts(id) ON DELETE CASCADE,
  tag_id  INT    NOT NULL REFERENCES blog_tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- ============================================================
-- PAGES  (post_type = 'page')
-- ============================================================

CREATE TABLE pages (
  id             BIGSERIAL PRIMARY KEY,
  wp_id          INT UNIQUE,
  title          TEXT NOT NULL,
  slug           TEXT NOT NULL,
  parent_id      BIGINT REFERENCES pages(id),
  content        TEXT,
  excerpt        TEXT,
  thumbnail_id   BIGINT REFERENCES media(id),
  visibility     post_visibility DEFAULT 'publish',
  menu_order     INT DEFAULT 0,
  page_template  TEXT,
  wp_created_at  TIMESTAMPTZ,
  wp_updated_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (slug, parent_id)
);

CREATE INDEX idx_pages_slug ON pages(slug);

-- ============================================================
-- MEMBERSHIP LEVELS  (wp_pmpro_membership_levels)
-- ============================================================

CREATE TABLE membership_levels (
  id                 SERIAL PRIMARY KEY,
  wp_id              INT UNIQUE,            -- pmpro level ID
  name               TEXT NOT NULL,
  description        TEXT,
  confirmation       TEXT,
  initial_payment    NUMERIC(10,2) DEFAULT 0,
  billing_amount     NUMERIC(10,2) DEFAULT 0,
  cycle_number       INT DEFAULT 0,
  cycle_period       membership_period DEFAULT 'Month',
  billing_limit      INT DEFAULT 0,         -- 0 = unlimited
  trial_amount       NUMERIC(10,2) DEFAULT 0,
  trial_limit        INT DEFAULT 0,
  allow_signups      BOOLEAN DEFAULT TRUE,
  stripe_price_id    TEXT,                  -- Stripe Price ID
  is_active          BOOLEAN DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- USERS  (wp_users + wp_usermeta)
-- Maps to Supabase Auth (auth.users) via user_id UUID
-- ============================================================

CREATE TABLE user_profiles (
  id                    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  wp_id                 INT UNIQUE,            -- original wp_users.ID

  -- Basic profile (wp_usermeta)
  first_name            TEXT,
  last_name             TEXT,
  display_name          TEXT,
  nickname              TEXT,
  description           TEXT,                  -- bio
  website               TEXT,

  -- Social
  facebook              TEXT,
  twitter               TEXT,
  googleplus            TEXT,
  linkedin              TEXT,

  -- Industry-specific (custom user meta)
  country               TEXT,
  stage                 TEXT,                  -- production stage preference
  custommer_job         TEXT,                  -- their job title
  about_production      TEXT,                  -- about themselves
  organization_name     TEXT,
  organization_type     TEXT,

  -- Avatar
  avatar_url            TEXT,

  -- WP role (subscriber, administrator, etc.)
  wp_role               TEXT DEFAULT 'subscriber',

  -- Timestamps
  wp_registered_at      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_profiles_wp_id ON user_profiles(wp_id);

-- ============================================================
-- MEMBERSHIPS  (wp_pmpro_memberships_users)
-- ============================================================

CREATE TABLE user_memberships (
  id                 BIGSERIAL PRIMARY KEY,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id           INT  NOT NULL REFERENCES membership_levels(id),
  status             membership_status DEFAULT 'active',

  -- Billing info (from PMPro usermeta)
  billing_first_name TEXT,
  billing_last_name  TEXT,
  billing_address1   TEXT,
  billing_address2   TEXT,
  billing_city       TEXT,
  billing_state      TEXT,
  billing_zip        TEXT,
  billing_country    TEXT,
  billing_phone      TEXT,
  billing_email      TEXT,

  -- Payment / Stripe
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  card_type          TEXT,
  card_last4         TEXT,
  card_exp_month     TEXT,
  card_exp_year      TEXT,

  -- Dates
  startdate          TIMESTAMPTZ,
  enddate            TIMESTAMPTZ,
  modified           TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_memberships_user ON user_memberships(user_id);
CREATE INDEX idx_memberships_level ON user_memberships(level_id);
CREATE INDEX idx_memberships_status ON user_memberships(status);
CREATE INDEX idx_memberships_stripe ON user_memberships(stripe_customer_id);

-- ============================================================
-- MEMBERSHIP ORDERS  (wp_pmpro_membership_orders)
-- ============================================================

CREATE TABLE membership_orders (
  id                 BIGSERIAL PRIMARY KEY,
  wp_id              INT UNIQUE,
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  level_id           INT REFERENCES membership_levels(id),
  code               TEXT UNIQUE,
  session_id         TEXT,

  billing_name       TEXT,
  billing_address1   TEXT,
  billing_city       TEXT,
  billing_state      TEXT,
  billing_zip        TEXT,
  billing_country    TEXT,
  billing_phone      TEXT,
  billing_email      TEXT,

  cardtype           TEXT,
  accountnumber      TEXT,
  expirationmonth    TEXT,
  expirationyear     TEXT,

  payment_type       TEXT DEFAULT 'stripe',
  subtotal           NUMERIC(10,2),
  tax                NUMERIC(10,2),
  coupondiscount     NUMERIC(10,2),
  certificatediscount NUMERIC(10,2),
  total              NUMERIC(10,2),

  payment_transaction_id TEXT,
  subscription_transaction_id TEXT,

  status             TEXT DEFAULT 'success',
  gateway            TEXT DEFAULT 'stripe',
  gateway_environment TEXT DEFAULT 'live',
  notes              TEXT,

  timestamp          TIMESTAMPTZ DEFAULT NOW(),
  created_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_user ON membership_orders(user_id);
CREATE INDEX idx_orders_level ON membership_orders(level_id);
CREATE INDEX idx_orders_timestamp ON membership_orders(timestamp DESC);

-- ============================================================
-- DISCOUNT CODES  (wp_pmpro_discount_codes)
-- ============================================================

CREATE TABLE discount_codes (
  id              SERIAL PRIMARY KEY,
  wp_id           INT UNIQUE,
  code            TEXT NOT NULL UNIQUE,
  description     TEXT,
  uses            INT DEFAULT 0,
  max_uses        INT DEFAULT 0,           -- 0 = unlimited
  start_date      DATE,
  end_date        DATE,
  discount_type   TEXT DEFAULT 'percentage', -- 'percentage' | 'flat'
  initial_payment NUMERIC(10,2) DEFAULT 0,
  billing_amount  NUMERIC(10,2) DEFAULT 0,
  cycle_number    INT DEFAULT 0,
  cycle_period    membership_period DEFAULT 'Month',
  trial_amount    NUMERIC(10,2) DEFAULT 0,
  trial_limit     INT DEFAULT 0
);

-- Discount codes ↔ membership levels
CREATE TABLE discount_code_levels (
  code_id  INT NOT NULL REFERENCES discount_codes(id) ON DELETE CASCADE,
  level_id INT NOT NULL REFERENCES membership_levels(id) ON DELETE CASCADE,
  PRIMARY KEY (code_id, level_id)
);

-- ============================================================
-- REDIRECTS  (safety net + Redirection plugin data)
-- ============================================================

CREATE TABLE url_redirects (
  id             SERIAL PRIMARY KEY,
  source_url     TEXT NOT NULL UNIQUE,
  target_url     TEXT NOT NULL,
  status_code    INT DEFAULT 301,
  is_active      BOOLEAN DEFAULT TRUE,
  notes          TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_redirects_source ON url_redirects(source_url);

-- Known redirect from Redirection plugin:
INSERT INTO url_redirects (source_url, target_url, status_code, notes)
VALUES ('/', '/productions', 301, 'Logged-in users redirected to productions. Handled in middleware.');

-- ============================================================
-- SEARCH METER  (wp_searchmeter)
-- ============================================================

CREATE TABLE search_log (
  id          BIGSERIAL PRIMARY KEY,
  query       TEXT NOT NULL,
  results     INT DEFAULT 0,
  searched_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- WP OPTIONS (select important ones)
-- ============================================================

CREATE TABLE site_options (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE productions ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE crew_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_orders ENABLE ROW LEVEL SECURITY;

-- Helper function: check if current user has an active membership
CREATE OR REPLACE FUNCTION auth.has_active_membership()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_memberships
    WHERE user_id = auth.uid()
      AND status = 'active'
      AND (enddate IS NULL OR enddate > NOW())
  )
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- -------- PRODUCTIONS --------
-- Public: can see title, slug, type, status, dates (teaser)
-- Members: can see full contact + crew details
CREATE POLICY "productions_public_read" ON productions
  FOR SELECT USING (visibility = 'publish');

-- Admins can do anything (service role bypasses RLS)

-- -------- COMPANIES --------
CREATE POLICY "companies_public_read" ON companies
  FOR SELECT USING (visibility = 'publish');

-- -------- CREW MEMBERS --------
-- Crew names/slugs are public; contact details (email/phone) hidden from non-members
-- (handled at application layer — all rows readable, contact info filtered in query)
CREATE POLICY "crew_public_read" ON crew_members
  FOR SELECT USING (visibility = 'publish');

-- -------- BLOG POSTS --------
CREATE POLICY "blog_public_read" ON blog_posts
  FOR SELECT USING (visibility = 'publish');

-- -------- PAGES --------
CREATE POLICY "pages_public_read" ON pages
  FOR SELECT USING (visibility IN ('publish', 'password'));

-- -------- USER PROFILES --------
-- Users can read/update their own profile
CREATE POLICY "profiles_own_read" ON user_profiles
  FOR SELECT USING (id = auth.uid());

CREATE POLICY "profiles_own_update" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- -------- MEMBERSHIPS --------
CREATE POLICY "memberships_own_read" ON user_memberships
  FOR SELECT USING (user_id = auth.uid());

-- -------- ORDERS --------
CREATE POLICY "orders_own_read" ON membership_orders
  FOR SELECT USING (user_id = auth.uid());

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_productions_updated
  BEFORE UPDATE ON productions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_companies_updated
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_crew_updated
  BEFORE UPDATE ON crew_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_profiles_updated
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- TRIGGER: auto-create user profile on auth.users insert
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO user_profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ============================================================
-- FULL-TEXT SEARCH indexes
-- ============================================================

CREATE INDEX idx_productions_fts ON productions
  USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

CREATE INDEX idx_companies_fts ON companies
  USING gin(to_tsvector('english', coalesce(title,'')));

CREATE INDEX idx_crew_fts ON crew_members
  USING gin(to_tsvector('english', coalesce(name,'')));

CREATE INDEX idx_blog_fts ON blog_posts
  USING gin(to_tsvector('english', coalesce(title,'') || ' ' || coalesce(content,'')));

-- ============================================================
-- SEED: Taxonomy data (from WordPress database)
-- ============================================================

-- production_types
INSERT INTO production_types (id, name, slug, parent_id) VALUES
  (1,  'Film',          'film',          NULL),
  (2,  'TV',            'tv',            NULL),
  (3,  'Theater',       'theater',       NULL),
  (4,  'Video Game',    'video-game',    NULL),
  (5,  'Pilot',         'pilot-2',       NULL),
  (6,  'Series',        'series-2',      NULL),
  (7,  'Feature Film',  'feature-film',  1),
  (8,  'Short Film',    'short-film',    1),
  (9,  'Student Film',  'student-film',  1),
  (10, 'Documentary',   'documentary',   1),
  (11, 'Pilot',         'pilot',         2),
  (12, 'Series',        'series',        2),
  (13, 'TV Movie',      'tv-movie',      2),
  (14, 'Musicals',      'musicals',      3),
  (15, 'Play',          'play',          3);

-- production_statuses
INSERT INTO production_statuses (id, name, slug) VALUES
  (1, 'Announced',       'announced'),
  (2, 'Casting',         'casting'),
  (3, 'Development',     'development'),
  (4, 'Halted',          'halted'),
  (5, 'Post-Production', 'post-production'),
  (6, 'Pre-production',  'pre-production'),
  (7, 'Production',      'production');

-- role_categories
INSERT INTO role_categories (id, name, slug) VALUES
  (1,  'Acquisitions Executive', 'acquisitions'),
  (2,  'Agent',                  'agent'),
  (3,  'Assistant',              'assistant'),
  (4,  'Assistant Director',     'assistant-director'),
  (5,  'Associate Producer',     'associate-producer'),
  (6,  'Casting Executive',      'casting-department'),
  (7,  'CEO',                    'ceo'),
  (8,  'Cinematographer',        'cinematographer'),
  (9,  'CTO',                    'cto'),
  (10, 'Development Executive',  'development'),
  (11, 'Director',               'director'),
  (12, 'Distribution Executive', 'distribution-executive'),
  (13, 'Editor',                 'editor'),
  (14, 'Executive Producer',     'executive-producer'),
  (15, 'Head of Post-Production','head-of-post-production'),
  (16, 'Line Producer',          'line-producer'),
  (17, 'Manager',                'manager'),
  (18, 'Marketing Executive',    'marketing-executive'),
  (19, 'Operations Executive',   'operations'),
  (20, 'Photographer',           'photographer'),
  (21, 'Producer',               'producer'),
  (22, 'Production Coordinator', 'production-coordinator'),
  (23, 'Production Manager',     'production-manager'),
  (24, 'Public Relations',       'public-relations'),
  (25, 'Sales Executive',        'sales-director'),
  (26, 'Talent Manager',         'talent-manager'),
  (27, 'UPM',                    'upm'),
  (28, 'Writer',                 'writer');

-- company_categories
INSERT INTO company_categories (id, name, slug) VALUES
  (1,  'Animation Studio',       'animation-studio'),
  (2,  'Casting Agency',         'casting-agency'),
  (3,  'Distributor',            'distributor'),
  (4,  'Entertainment Company',  'entertainment-company'),
  (5,  'Film Financing',         'film-financing'),
  (6,  'Film Studio',            'film-studio'),
  (7,  'Media Broadcaster',      'media-broadcaster'),
  (8,  'Media Company',          'media-company'),
  (9,  'Non-profit',             'non-profit'),
  (10, 'Post Production & VFX',  'post-production-vfx'),
  (11, 'Production Company',     'production-company'),
  (12, 'Record Label',           'record-label'),
  (13, 'Streaming Platform',     'streaming-platform'),
  (14, 'Talent Agency',          'talent-agency'),
  (15, 'Talent Management',      'talent-management'),
  (16, 'Theatre Company',        'theatre-company'),
  (17, 'TV Network',             'tv-network'),
  (18, 'Video Game Studio',      'video-game-studio');

-- blog_categories
INSERT INTO blog_categories (id, name, slug) VALUES
  (1, 'Casting Calls',    'casting-calls'),
  (2, 'Film Jobs',        'film-jobs'),
  (3, 'How-to',           'how-to'),
  (4, 'Industry News',    'industry-news'),
  (5, 'Production List',  'production-list'),
  (6, 'Project Alerts',   'project-alerts');

-- membership_levels
INSERT INTO membership_levels (id, wp_id, name, description, initial_payment, billing_amount, cycle_number, cycle_period, allow_signups) VALUES
  (1, 1, 'Annual Pro Plan',       '12-months discounted at $38.95/mo (billed annually)',             467.40, 467.40, 1, 'Year',  TRUE),
  (2, 2, '6-Month Unlimited',     '6-months discounted at $48.95/mo (billed semiannually)',           293.70, 293.70, 6, 'Month', TRUE),
  (3, 3, 'Monthly Unlimited',     'Regular membership dues of just $58.95 per month',                  58.95,  58.95, 1, 'Month', TRUE),
  (4, 4, '1-Month Trial',         'Save 50% introductory offer — $29.95 first month, then $58.95',    29.95,  58.95, 1, 'Month', TRUE),
  (5, 5, '50% Off Annual Pro',    'Exclusive for Former Members — $233.70/year',                      233.70, 467.40, 1, 'Year',  TRUE),
  (6, 6, '14-Day Free Trial',     'Free 14-day trial, then $47.95/month',                              47.95,  47.95, 1, 'Month', FALSE),
  (7, 7, '14-Day Free Trial Alt', 'Free 14-day trial, then $47.95/month',                              47.95,  47.95, 1, 'Month', FALSE);
