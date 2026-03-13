import { MetadataRoute } from 'next'
import { createClient } from '@/lib/supabase/server'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://productionlist.com'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const supabase = await createClient()

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${SITE_URL}/blog`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${SITE_URL}/what-is-production-list`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/membership-plans`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${SITE_URL}/contact`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${SITE_URL}/production-resources`, changeFrequency: 'monthly', priority: 0.5 },
  ]

  // Productions
  const { data: productions } = await supabase
    .from('productions')
    .select('slug, updated_at')
    .eq('visibility', 'publish')
    .order('updated_at', { ascending: false })
    .limit(5000)

  const productionRoutes: MetadataRoute.Sitemap = (productions ?? []).map((p) => ({
    url: `${SITE_URL}/production/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    changeFrequency: 'weekly',
    priority: 0.8,
  }))

  // Companies
  const { data: companies } = await supabase
    .from('companies')
    .select('slug, updated_at')
    .eq('visibility', 'publish')
    .limit(5000)

  const companyRoutes: MetadataRoute.Sitemap = (companies ?? []).map((c) => ({
    url: `${SITE_URL}/production-contact/${c.slug}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Crew
  const { data: crew } = await supabase
    .from('crew_members')
    .select('slug, updated_at')
    .eq('visibility', 'publish')
    .limit(5000)

  const crewRoutes: MetadataRoute.Sitemap = (crew ?? []).map((c) => ({
    url: `${SITE_URL}/production-role/${c.slug}`,
    lastModified: c.updated_at ? new Date(c.updated_at) : undefined,
    changeFrequency: 'weekly',
    priority: 0.6,
  }))

  // Blog posts
  const { data: blogPosts } = await supabase
    .from('blog_posts')
    .select('slug, updated_at')
    .eq('status', 'published')
    .limit(2000)

  const blogRoutes: MetadataRoute.Sitemap = (blogPosts ?? []).map((p) => ({
    url: `${SITE_URL}/${p.slug}`,
    lastModified: p.updated_at ? new Date(p.updated_at) : undefined,
    changeFrequency: 'monthly',
    priority: 0.5,
  }))

  // Taxonomy pages
  const { data: prodTypes } = await supabase
    .from('production_types')
    .select('slug')

  const { data: prodStatuses } = await supabase
    .from('production_statuses')
    .select('slug')

  const { data: roleCategories } = await supabase
    .from('role_categories')
    .select('slug')

  const { data: companyCategories } = await supabase
    .from('company_categories')
    .select('slug')

  const taxonomyRoutes: MetadataRoute.Sitemap = [
    ...(prodTypes ?? []).map((t) => ({
      url: `${SITE_URL}/production-type/${t.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...(prodStatuses ?? []).map((t) => ({
      url: `${SITE_URL}/production-union/${t.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...(roleCategories ?? []).map((t) => ({
      url: `${SITE_URL}/production-rcat/${t.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
    ...(companyCategories ?? []).map((t) => ({
      url: `${SITE_URL}/production-ccat/${t.slug}`,
      changeFrequency: 'weekly' as const,
      priority: 0.5,
    })),
  ]

  return [
    ...staticRoutes,
    ...productionRoutes,
    ...companyRoutes,
    ...crewRoutes,
    ...blogRoutes,
    ...taxonomyRoutes,
  ]
}
