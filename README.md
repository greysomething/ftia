# Production List — Next.js App

A complete rebuild of productionlist.com as a modern Next.js 15 (App Router) application backed by Supabase, Stripe, and deployed on Netlify.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router, React 19) |
| Database / Auth | Supabase (Postgres + Auth + Storage) |
| Payments | Stripe (Checkout + Webhooks) |
| Styling | Tailwind CSS v3 |
| Hosting | Netlify + `@netlify/plugin-nextjs` |
| Language | TypeScript |

---

## Project Structure

```
nextjs-app/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (auth)/             # Login, Register, Forgot Password
│   │   ├── [slug]/             # WordPress /%postname%/ catch-all
│   │   ├── api/                # API routes
│   │   │   ├── stripe/         # Stripe checkout, cancel, webhook
│   │   │   ├── feed/           # RSS feed
│   │   │   └── search/         # Global search
│   │   ├── blog/               # Blog listing
│   │   ├── category/[slug]/    # Blog category archives
│   │   ├── tag/[slug]/         # Blog tag archives
│   │   ├── membership-account/ # Member dashboard + billing
│   │   ├── production/[slug]/  # Single production detail
│   │   ├── production-contact/ # Company directory
│   │   ├── production-role/    # Crew member directory
│   │   ├── production-list/    # Production lists
│   │   ├── production-type/    # Taxonomy archives
│   │   ├── production-union/   # Taxonomy archives
│   │   ├── production-rcat/    # Role category archives
│   │   ├── production-ccat/    # Company category archives
│   │   ├── productions/        # Members production database
│   │   ├── sitemap.ts          # Dynamic XML sitemap
│   │   └── robots.ts           # robots.txt
│   ├── components/             # Shared UI components
│   ├── lib/                    # Utilities, Supabase clients, queries, auth
│   ├── middleware.ts            # Auth + redirect middleware
│   └── types/                  # TypeScript database types
├── scripts/
│   └── migration/              # WordPress → Supabase migration scripts
├── supabase-schema.sql         # Full Postgres schema (run in Supabase SQL editor)
├── netlify.toml                # Netlify deployment config
└── .env.example                # Environment variable template
```

---

## Local Development

### 1. Clone and install

```bash
cd nextjs-app
npm install
```

### 2. Environment variables

```bash
cp .env.example .env.local
# Fill in all values (see .env.example for descriptions)
```

Required env vars:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_*` (one per membership level — 7 total)

### 3. Apply Supabase schema

In the Supabase dashboard → SQL Editor, run the contents of `supabase-schema.sql`.

### 4. Run dev server

```bash
npm run dev
```

---

## Data Migration (WordPress → Supabase)

The migration scripts read from the Local WP MySQL database and write to Supabase.

**Prerequisites:**
- Local WP must be running (MySQL socket must be accessible)
- `.env.local` must contain `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`
- `supabase-schema.sql` must already be applied

**Run all migrations:**

```bash
npm run migrate
```

**Run a single migration step:**

```bash
npx ts-node --project tsconfig.scripts.json scripts/migration/run-all.ts --only=Productions
```

Available step names: `Taxonomy`, `Media`, `Productions`, `Companies`, `Crew Members`, `Blog Posts`, `Pages`, `Relations`, `Users`, `Memberships`

**Skip specific steps:**

```bash
npx ts-node --project tsconfig.scripts.json scripts/migration/run-all.ts --skip=Users,Memberships
```

**Continue after errors:**

```bash
npm run migrate -- --continue-on-error
```

### Migration order (dependency graph)

```
Taxonomy ──────┐
Media ─────────┤
               ▼
Productions ───┐
Companies ─────┤──► Relations
Crew Members ──┘
               ▼
Blog Posts
Pages
               ▼
Users ─────────► Memberships
```

### Media file upload

The `migrate-media.ts` step records attachment metadata only. To upload actual files to Supabase Storage:

```bash
# Set WP_MEDIA_PATH to your Local WP uploads directory
WP_MEDIA_PATH="/path/to/app/public/wp-content/uploads" \
npx ts-node --project tsconfig.scripts.json scripts/migration/upload-media.ts
```

---

## Stripe Setup

### Webhook configuration

In Stripe Dashboard → Webhooks, add an endpoint:
- URL: `https://productionlist.com/api/stripe/webhook`
- Events to listen for:
  - `checkout.session.completed`
  - `invoice.payment_succeeded`
  - `invoice.payment_failed`
  - `customer.subscription.deleted`

Copy the webhook signing secret to `STRIPE_WEBHOOK_SECRET`.

### Local webhook testing

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

---

## Deployment (Netlify)

### 1. Connect repo

In Netlify: New Site → Import from Git → select this repo.

### 2. Build settings

These are already set in `netlify.toml`:
- Build command: `npm run build`
- Publish directory: `.next`

### 3. Environment variables

In Netlify → Site Settings → Environment Variables, add all variables from `.env.example`.

### 4. Plugin

`@netlify/plugin-nextjs` is configured in `netlify.toml` and handles SSR, ISR, and image optimization automatically.

---

## URL Preservation

All WordPress URLs are preserved exactly:

| WordPress URL | Next.js Route |
|---|---|
| `/production/{slug}` | `src/app/production/[slug]/page.tsx` |
| `/production-contact/{slug}` | `src/app/production-contact/[slug]/page.tsx` |
| `/production-role/{slug}` | `src/app/production-role/[slug]/page.tsx` |
| `/production-list/{slug}` | `src/app/production-list/[slug]/page.tsx` |
| `/production-type/{slug}/` | `src/app/production-type/[slug]/page.tsx` |
| `/production-union/{slug}/` | `src/app/production-union/[slug]/page.tsx` |
| `/production-rcat/{slug}/` | `src/app/production-rcat/[slug]/page.tsx` |
| `/production-ccat/{slug}/` | `src/app/production-ccat/[slug]/page.tsx` |
| `/{blog-post-slug}` | `src/app/[slug]/page.tsx` (catches WP flat namespace) |
| `/{page-slug}` | `src/app/[slug]/page.tsx` |
| `/blog` | `src/app/blog/page.tsx` |
| `/category/{slug}` | `src/app/category/[slug]/page.tsx` |
| `/tag/{slug}` | `src/app/tag/[slug]/page.tsx` |
| `/membership-account` | `src/app/membership-account/page.tsx` |
| `/my-account` | Redirects to `/membership-account` |
| `/membership-plans` | Redirects to `/membership-account/membership-levels` |
| `/feed` | Redirects to `/api/feed` |
| `/current-production-list` | Redirects to `/productions` |

---

## Membership Levels

| Level | Price | Period |
|---|---|---|
| Annual Pro Plan | $467.40/year ($38.95/mo) | Annual |
| 6-Month Unlimited | $293.70/6mo ($48.95/mo) | 6 months |
| Monthly Unlimited | $58.95/month | Monthly |
| 1-Month Trial | $29.95 then $58.95/mo | Monthly |
| 50% Off Annual Pro | $233.70/year ($19.47/mo) | Annual |
| 14-Day Free Trial | $47.95/month | Monthly |
| 14-Day Free Trial Alt | $47.95/month | Monthly |

---

## Key Architectural Decisions

### Member-gated content
Contact details (email, phone, address, LinkedIn) for companies and crew members are only visible to active members. Non-members see blurred/hidden content with a join CTA. This is enforced at render time via `isMember(userId)` in server components.

### WordPress flat URL namespace
WordPress uses `/%postname%/` as the permalink structure, meaning blog posts and pages share a flat URL space (e.g., `/some-article`). The `src/app/[slug]/page.tsx` catch-all handles this by checking `blog_posts` first, then `pages`.

### Serialized PHP data
WordPress stored production relationships in serialized PHP. Two formats exist in the data:
- **New format** (contact): `[{contactID: "123"}]` — links to `production-contact` posts
- **Old format** (contact): `{companies: [], address: [], phone: [], fax: [], email: []}` — inline data
- **New format** (roles): `[{rolename: "Director", peoples: [{peopleID: "123"}]}]`
- **Old format** (roles): `{role: [], name: []}` — parallel arrays

Both formats are handled in `migrate-relations.ts` and stored in both normalized junction tables and raw JSONB fields.
