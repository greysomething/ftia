export type PostVisibility = 'publish' | 'private' | 'draft' | 'password'
export type MembershipStatus = 'active' | 'inactive' | 'cancelled' | 'expired' | 'pending' | 'token' | 'review'
export type MembershipPeriod = 'Day' | 'Week' | 'Month' | 'Year'
export type ProductionPhase = 'in-pre-production' | 'in-production' | 'in-post-production' | 'completed'

export interface Database {
  public: {
    Tables: {
      productions: {
        Row: Production
        Insert: Omit<Production, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Production, 'id'>>
      }
      companies: {
        Row: Company
        Insert: Omit<Company, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Company, 'id'>>
      }
      crew_members: {
        Row: CrewMember
        Insert: Omit<CrewMember, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<CrewMember, 'id'>>
      }
      production_lists: {
        Row: ProductionList
        Insert: Omit<ProductionList, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<ProductionList, 'id'>>
      }
      blog_posts: {
        Row: BlogPost
        Insert: Omit<BlogPost, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<BlogPost, 'id'>>
      }
      pages: {
        Row: Page
        Insert: Omit<Page, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<Omit<Page, 'id'>>
      }
      user_profiles: {
        Row: UserProfile
        Insert: Omit<UserProfile, 'created_at' | 'updated_at'>
        Update: Partial<Omit<UserProfile, 'id'>>
      }
      user_memberships: {
        Row: UserMembership
        Insert: Omit<UserMembership, 'id' | 'created_at'>
        Update: Partial<Omit<UserMembership, 'id'>>
      }
      membership_levels: {
        Row: MembershipLevel
        Insert: Omit<MembershipLevel, 'id' | 'created_at'>
        Update: Partial<Omit<MembershipLevel, 'id'>>
      }
      membership_orders: {
        Row: MembershipOrder
        Insert: Omit<MembershipOrder, 'id' | 'created_at'>
        Update: Partial<Omit<MembershipOrder, 'id'>>
      }
      production_types: {
        Row: TaxonomyTerm
        Insert: Omit<TaxonomyTerm, 'id'>
        Update: Partial<Omit<TaxonomyTerm, 'id'>>
      }
      production_statuses: {
        Row: TaxonomyTerm
        Insert: Omit<TaxonomyTerm, 'id'>
        Update: Partial<Omit<TaxonomyTerm, 'id'>>
      }
      role_categories: {
        Row: TaxonomyTerm
        Insert: Omit<TaxonomyTerm, 'id'>
        Update: Partial<Omit<TaxonomyTerm, 'id'>>
      }
      company_categories: {
        Row: TaxonomyTerm
        Insert: Omit<TaxonomyTerm, 'id'>
        Update: Partial<Omit<TaxonomyTerm, 'id'>>
      }
      blog_categories: {
        Row: TaxonomyTerm
        Insert: Omit<TaxonomyTerm, 'id'>
        Update: Partial<Omit<TaxonomyTerm, 'id'>>
      }
      blog_tags: {
        Row: { id: number; name: string; slug: string; description: string | null }
        Insert: Omit<{ id: number; name: string; slug: string; description: string | null }, 'id'>
        Update: Partial<{ name: string; slug: string; description: string | null }>
      }
      production_locations: {
        Row: ProductionLocation
        Insert: Omit<ProductionLocation, 'id'>
        Update: Partial<Omit<ProductionLocation, 'id'>>
      }
      production_type_links: {
        Row: { production_id: number; type_id: number; is_primary: boolean }
        Insert: { production_id: number; type_id: number; is_primary?: boolean }
        Update: { is_primary?: boolean }
      }
      production_status_links: {
        Row: { production_id: number; status_id: number; is_primary: boolean }
        Insert: { production_id: number; status_id: number; is_primary?: boolean }
        Update: { is_primary?: boolean }
      }
      company_category_links: {
        Row: { company_id: number; category_id: number; is_primary: boolean }
        Insert: { company_id: number; category_id: number; is_primary?: boolean }
        Update: { is_primary?: boolean }
      }
      crew_category_links: {
        Row: { crew_id: number; category_id: number; is_primary: boolean }
        Insert: { crew_id: number; category_id: number; is_primary?: boolean }
        Update: { is_primary?: boolean }
      }
      company_staff: {
        Row: CompanyStaff
        Insert: Omit<CompanyStaff, 'id'>
        Update: Partial<Omit<CompanyStaff, 'id'>>
      }
      production_company_links: {
        Row: ProductionCompanyLink
        Insert: Omit<ProductionCompanyLink, 'id'>
        Update: Partial<Omit<ProductionCompanyLink, 'id'>>
      }
      production_crew_roles: {
        Row: ProductionCrewRole
        Insert: Omit<ProductionCrewRole, 'id'>
        Update: Partial<Omit<ProductionCrewRole, 'id'>>
      }
      url_redirects: {
        Row: { id: number; source_url: string; target_url: string; status_code: number; is_active: boolean; notes: string | null; created_at: string }
        Insert: Omit<{ id: number; source_url: string; target_url: string; status_code: number; is_active: boolean; notes: string | null; created_at: string }, 'id' | 'created_at'>
        Update: Partial<{ target_url: string; status_code: number; is_active: boolean; notes: string | null }>
      }
      media: {
        Row: Media
        Insert: Omit<Media, 'id' | 'created_at'>
        Update: Partial<Omit<Media, 'id'>>
      }
    }
    Views: Record<string, never>
    Functions: {
      has_active_membership: {
        Args: Record<string, never>
        Returns: boolean
      }
    }
    Enums: {
      post_visibility: PostVisibility
      membership_status: MembershipStatus
      membership_period: MembershipPeriod
      production_phase: ProductionPhase
    }
  }
}

// ---- Entity types ----

export interface Production {
  id: number
  wp_id: number | null
  title: string
  slug: string
  content: string | null
  excerpt: string | null
  visibility: PostVisibility
  thumbnail_id: number | null
  production_date_start: string | null
  production_date_end: string | null
  production_date_startpost: string | null
  production_date_endpost: string | null
  _raw_contact: unknown | null
  _raw_roles: unknown | null
  _raw_locations: unknown | null
  _raw_locations_new: unknown | null
  computed_status: ProductionPhase
  blog_linked: number | null
  wp_author_id: number | null
  wp_created_at: string | null
  wp_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface ProductionWithRelations extends Production {
  production_type_links?: Array<{ production_types: TaxonomyTerm; is_primary: boolean }>
  production_status_links?: Array<{ production_statuses: TaxonomyTerm; is_primary: boolean }>
  production_locations?: ProductionLocation[]
  production_company_links?: Array<ProductionCompanyLink & { companies?: Company }>
  production_crew_roles?: Array<ProductionCrewRole & { crew_members?: CrewMember }>
  media?: Media | null
}

export interface Company {
  id: number
  wp_id: number | null
  title: string
  slug: string
  content: string | null
  thumbnail_id: number | null
  addresses: string[]
  phones: string[]
  faxes: string[]
  emails: string[]
  linkedin: string | null
  twitter: string | null
  visibility: PostVisibility
  wp_author_id: number | null
  wp_created_at: string | null
  wp_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface CrewMember {
  id: number
  wp_id: number | null
  name: string
  slug: string
  emails: string[]
  phones: string[]
  linkedin: string | null
  twitter: string | null
  visibility: PostVisibility
  wp_author_id: number | null
  wp_created_at: string | null
  wp_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface ProductionList {
  id: number
  wp_id: number | null
  title: string
  slug: string
  content: string | null
  excerpt: string | null
  thumbnail_id: number | null
  visibility: PostVisibility
  wp_created_at: string | null
  wp_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface BlogPost {
  id: number
  wp_id: number | null
  title: string
  slug: string
  content: string | null
  excerpt: string | null
  thumbnail_id: number | null
  visibility: PostVisibility
  published_at: string | null
  wp_author_id: number | null
  wp_created_at: string | null
  wp_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface Page {
  id: number
  wp_id: number | null
  title: string
  slug: string
  parent_id: number | null
  content: string | null
  excerpt: string | null
  thumbnail_id: number | null
  visibility: PostVisibility
  menu_order: number
  page_template: string | null
  wp_created_at: string | null
  wp_updated_at: string | null
  created_at: string
  updated_at: string
}

export interface UserProfile {
  id: string
  wp_id: number | null
  first_name: string | null
  last_name: string | null
  display_name: string | null
  nickname: string | null
  description: string | null
  website: string | null
  facebook: string | null
  twitter: string | null
  googleplus: string | null
  linkedin: string | null
  country: string | null
  stage: string | null
  custommer_job: string | null
  about_production: string | null
  organization_name: string | null
  organization_type: string | null
  avatar_url: string | null
  wp_role: string
  wp_registered_at: string | null
  created_at: string
  updated_at: string
}

export interface UserMembership {
  id: number
  user_id: string
  level_id: number
  status: MembershipStatus
  billing_first_name: string | null
  billing_last_name: string | null
  billing_address1: string | null
  billing_address2: string | null
  billing_city: string | null
  billing_state: string | null
  billing_zip: string | null
  billing_country: string | null
  billing_phone: string | null
  billing_email: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  card_type: string | null
  card_last4: string | null
  card_exp_month: string | null
  card_exp_year: string | null
  startdate: string | null
  enddate: string | null
  modified: string
  created_at: string
}

export interface MembershipLevel {
  id: number
  wp_id: number | null
  name: string
  description: string | null
  confirmation: string | null
  initial_payment: number
  billing_amount: number
  cycle_number: number
  cycle_period: MembershipPeriod
  billing_limit: number
  trial_amount: number
  trial_limit: number
  allow_signups: boolean
  stripe_price_id: string | null
  is_active: boolean
  created_at: string
}

export interface MembershipOrder {
  id: number
  wp_id: number | null
  user_id: string
  level_id: number | null
  code: string | null
  subtotal: number | null
  tax: number | null
  total: number | null
  payment_type: string
  payment_transaction_id: string | null
  subscription_transaction_id: string | null
  status: string
  gateway: string
  timestamp: string
  created_at: string
}

export interface TaxonomyTerm {
  id: number
  name: string
  slug: string
  parent_id: number | null
  description: string | null
  sort_order: number
}

export interface ProductionLocation {
  id: number
  production_id: number
  location: string
  stage: string | null
  city: string | null
  country: string | null
  sort_order: number
}

export interface CompanyStaff {
  id: number
  company_id: number
  crew_id: number
  position: string | null
  sort_order: number
}

export interface ProductionCompanyLink {
  id: number
  production_id: number
  company_id: number | null
  inline_name: string | null
  inline_address: string | null
  inline_phones: string[]
  inline_faxes: string[]
  inline_emails: string[]
  inline_linkedin: string | null
  sort_order: number
}

export interface ProductionCrewRole {
  id: number
  production_id: number
  crew_id: number | null
  role_name: string
  inline_name: string | null
  inline_linkedin: string | null
  inline_phones: string[]
  inline_emails: string[]
  sort_order: number
}

export interface Media {
  id: number
  wp_id: number | null
  filename: string
  storage_path: string | null
  original_url: string | null
  mime_type: string | null
  alt_text: string | null
  title: string | null
  width: number | null
  height: number | null
  created_at: string
}
