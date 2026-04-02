/**
 * Catch-all for WordPress /%postname%/ permalink structure.
 * WordPress uses a flat namespace — blog posts AND pages share the same URL depth.
 * We check blog_posts first, then pages, then 404.
 */

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import { getBlogPostBySlug, getPageBySlug, getBlogSlugs, getBlogPosts } from '@/lib/queries'
import {
  formatDate,
  formatRelativeDate,
  generateExcerpt,
  estimateReadTime,
  stripHtml,
  getFeaturedImageUrl,
  rewriteContentImageUrls,
} from '@/lib/utils'
import { TrendingSearches } from '@/components/TrendingSearches'

// Revalidate every 60s so scheduled posts are hidden until publish time
export const revalidate = 60

interface Props {
  params: Promise<{ slug: string }>
}

// Known page slugs that redirect elsewhere
const REDIRECTS: Record<string, string> = {
  'current-production-list': '/productions',
  'home': '/',
}

/* ── Category colors ──────────────────────────────────── */
const CAT_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  'project-alerts': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  'industry-news': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'casting-calls': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  'film-jobs': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  'how-to': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  'production-list': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
}

function getCatColor(slug: string) {
  return CAT_COLORS[slug] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500' }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  const post = await getBlogPostBySlug(slug)
  if (post) {
    const desc = post.content ? generateExcerpt(post.content, 160) : undefined
    return {
      title: post.title,
      description: desc,
      alternates: { canonical: `/${post.slug}` },
    }
  }

  const page = await getPageBySlug(slug)
  if (page) {
    return {
      title: page.title,
      description: page.excerpt ? page.excerpt.replace(/<[^>]+>/g, '').slice(0, 160) : undefined,
      alternates: { canonical: `/${page.slug}` },
    }
  }

  return { title: 'Not Found' }
}

export async function generateStaticParams() {
  const slugs = await getBlogSlugs()
  return slugs.map((p) => ({ slug: p.slug }))
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params

  // Handle known redirects
  if (REDIRECTS[slug]) {
    redirect(REDIRECTS[slug])
  }

  // Try blog post first
  const post = await getBlogPostBySlug(slug)
  if (post) {
    const p = post as any
    const categories = p.blog_post_categories ?? []
    const tags = p.blog_post_tags ?? []
    const readTime = estimateReadTime(post.content)
    const wordCount = post.content ? stripHtml(post.content).split(/\s+/).length : 0
    const featuredImage = getFeaturedImageUrl(p)

    // Fetch related posts
    const { posts: recentPosts } = await getBlogPosts(1, { perPage: 4 })
    const relatedPosts = (recentPosts as any[]).filter((rp: any) => rp.slug !== slug).slice(0, 3)

    return (
      <>
        {/* ─── Article Header ───────────────────────────── */}
        <div className="bg-primary relative overflow-hidden">
          <div className="page-wrap py-8 md:py-10 relative z-10">
            {/* Breadcrumb */}
            <nav className="flex items-center gap-2 text-sm text-white mb-4">
              <Link href="/" className="text-white/80 hover:text-white transition-colors">Home</Link>
              <span className="text-white/50">/</span>
              <Link href="/blog" className="text-white/80 hover:text-white transition-colors">News</Link>
              {categories[0] && (
                <>
                  <span className="text-white/40">/</span>
                  <Link
                    href={`/blog?category=${categories[0].blog_categories.slug}`}
                    className="text-accent hover:text-white transition-colors"
                  >
                    {categories[0].blog_categories.name}
                  </Link>
                </>
              )}
            </nav>

            {/* Categories */}
            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {categories.map((cat: any) => {
                  const c = getCatColor(cat.blog_categories.slug)
                  return (
                    <Link
                      key={cat.blog_categories.id}
                      href={`/blog?category=${cat.blog_categories.slug}`}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${c.bg} ${c.text}`}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                      {cat.blog_categories.name}
                    </Link>
                  )
                })}
              </div>
            )}

            <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white leading-tight max-w-4xl">
              {post.title}
            </h1>

            {/* Meta */}
            <div className="flex flex-wrap items-center gap-4 mt-4 text-sm text-white/70">
              <time className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {formatDate(post.published_at)}
              </time>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {readTime} min read
              </span>
            </div>
          </div>

          {/* Broadcast-quality animated layers — CSS-only, no JS */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">

            {/* ── FULL-WIDTH SWEEPING BANDS ── */}
            <div className="absolute top-0 left-0 w-full h-full">
              <div className="absolute w-[50%] h-full bg-gradient-to-r from-transparent via-accent/[0.12] to-transparent animate-[slideRight_14s_ease-in-out_infinite]" />
            </div>
            <div className="absolute top-0 left-0 w-full h-full">
              <div className="absolute w-[35%] h-full bg-gradient-to-r from-transparent via-white/[0.06] to-transparent animate-[slideLeft_18s_ease-in-out_infinite_3s]" />
            </div>

            {/* ── THICK HORIZONTAL BARS ── */}
            <div className="absolute top-[12%] left-0 w-full h-[3px]">
              <div className="absolute w-[65%] h-full bg-gradient-to-r from-transparent via-accent/30 to-transparent animate-[slideRight_10s_linear_infinite]" />
            </div>
            <div className="absolute top-[45%] left-0 w-full h-1">
              <div className="absolute w-[55%] h-full bg-gradient-to-r from-transparent via-white/[0.15] to-transparent animate-[slideLeft_13s_linear_infinite_1s]" />
            </div>
            <div className="absolute top-[72%] left-0 w-full h-[3px]">
              <div className="absolute w-[70%] h-full bg-gradient-to-r from-transparent via-accent/25 to-transparent animate-[slideRight_11s_linear_infinite_2s]" />
            </div>
            <div className="absolute top-[90%] left-0 w-full h-1">
              <div className="absolute w-[45%] h-full bg-gradient-to-r from-transparent via-white/[0.12] to-transparent animate-[slideLeft_9s_linear_infinite]" />
            </div>

            {/* ── BOLD DIAGONAL SLASHES ── */}
            <div className="absolute -right-12 top-0 w-[200px] h-[150%] -skew-x-12 bg-gradient-to-b from-accent/[0.10] via-accent/[0.04] to-transparent animate-[float_10s_ease-in-out_infinite]" />
            <div className="absolute right-[8%] -top-[20%] w-[120px] h-[150%] -skew-x-[20deg] bg-gradient-to-b from-transparent via-white/[0.05] to-transparent animate-[float_14s_ease-in-out_infinite_reverse]" />
            <div className="absolute right-[22%] top-0 w-[80px] h-full skew-x-12 bg-gradient-to-b from-transparent via-accent/[0.06] to-transparent animate-[float_12s_ease-in-out_infinite_3s]" />

            {/* ── LARGE GLOWING ORBS ── */}
            <div className="absolute -right-20 top-1/4 w-[500px] h-[500px] rounded-full bg-accent/[0.12] blur-[100px] animate-[float_16s_ease-in-out_infinite]" />
            <div className="absolute right-[15%] -bottom-20 w-[350px] h-[350px] rounded-full bg-accent/[0.08] blur-[80px] animate-[float_20s_ease-in-out_infinite_reverse]" />
            <div className="absolute left-[40%] -top-10 w-[300px] h-[300px] rounded-full bg-white/[0.04] blur-[60px] animate-[float_18s_ease-in-out_infinite_5s]" />

            {/* ── SCROLLING BLOCK SEGMENTS — ticker data feel ── */}
            <div className="absolute top-[28%] left-0 w-full h-8 opacity-[0.04]">
              <div className="flex gap-6 animate-[slideRight_25s_linear_infinite]">
                {Array.from({ length: 12 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-24 h-full rounded bg-white" />
                ))}
              </div>
            </div>
            <div className="absolute top-[65%] left-0 w-full h-6 opacity-[0.03]">
              <div className="flex gap-8 animate-[slideLeft_30s_linear_infinite_2s]">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex-shrink-0 w-32 h-full rounded bg-accent" />
                ))}
              </div>
            </div>

            {/* ── BOLD VERTICAL ACCENTS ── */}
            <div className="absolute right-[6%] top-0 w-[3px] h-full bg-gradient-to-b from-transparent via-accent/20 to-transparent animate-[shimmer_5s_ease-in-out_infinite]" />
            <div className="absolute right-[14%] top-0 w-[2px] h-full bg-gradient-to-b from-transparent via-white/[0.10] to-transparent animate-[shimmer_7s_ease-in-out_infinite_2s]" />

            {/* ── GEOMETRIC SHAPES — angular accents ── */}
            <div className="absolute -top-8 -right-8 w-40 h-40 border-2 border-accent/[0.12] rounded-lg rotate-45 animate-[float_12s_ease-in-out_infinite_1s]" />
            <div className="absolute -bottom-4 right-[12%] w-24 h-24 border border-white/[0.06] rounded rotate-[30deg] animate-[float_15s_ease-in-out_infinite_reverse]" />
          </div>

          <div className="h-1 bg-accent relative z-10" />
        </div>

        {/* ─── Main Content Area ────────────────────────── */}
        <div className="page-wrap py-8">
          <div className="flex flex-col lg:flex-row gap-8">
            {/* Article Body */}
            <article className="flex-1 min-w-0">
              {/* Featured Image */}
              {featuredImage && (
                <div className="relative w-full aspect-[16/9] rounded-xl overflow-hidden shadow-sm mb-8">
                  <Image
                    src={featuredImage}
                    alt={post.title}
                    fill
                    className="object-cover"
                    sizes="(max-width: 1024px) 100vw, 70vw"
                    priority
                  />
                </div>
              )}
              <div className="bg-white rounded-xl border border-gray-200 p-6 md:p-8 lg:p-10">
                <div
                  className="prose prose-lg max-w-none
                    prose-headings:text-gray-900 prose-headings:font-bold
                    prose-h2:text-2xl prose-h2:mt-10 prose-h2:mb-4
                    prose-h3:text-xl prose-h3:mt-8 prose-h3:mb-3
                    prose-h4:text-lg prose-h4:mt-6 prose-h4:mb-2
                    prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4
                    prose-a:text-accent prose-a:no-underline hover:prose-a:underline
                    prose-strong:text-gray-900
                    prose-ul:my-4 prose-ol:my-4
                    prose-li:text-gray-700
                    prose-blockquote:border-accent prose-blockquote:bg-accent/5 prose-blockquote:py-1 prose-blockquote:rounded-r-lg
                    prose-img:rounded-lg prose-img:shadow-sm"
                  dangerouslySetInnerHTML={{ __html: rewriteContentImageUrls(post.content ?? '') }}
                />

                {/* Tags */}
                {tags.length > 0 && (
                  <div className="mt-10 pt-6 border-t border-gray-200">
                    <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-3">
                      Tagged
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {tags.map((tag: any) => (
                        <Link
                          key={tag.blog_tags.id}
                          href={`/tag/${tag.blog_tags.slug}`}
                          className="text-sm text-gray-600 hover:text-accent border border-gray-200 hover:border-accent/30 px-3 py-1.5 rounded-full transition-colors"
                        >
                          #{tag.blog_tags.name}
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ─── Inline CTA (below article) ────────── */}
              <div className="bg-primary rounded-xl p-8 mt-8 text-center">
                <h3 className="text-xl font-bold text-white mb-2">
                  Stay Ahead of the Industry
                </h3>
                <p className="text-white/70 mb-5 max-w-lg mx-auto">
                  Get full access to 1,500+ active productions with contacts, crew details, and weekly
                  updated project lists. Everything you need to find your next opportunity.
                </p>
                <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                  <Link
                    href="/membership-plans"
                    className="bg-accent hover:bg-accent-dark text-white font-semibold px-8 py-3 rounded-lg transition-colors"
                  >
                    View Membership Plans
                  </Link>
                  <Link
                    href="/productions"
                    className="text-white/70 hover:text-white font-medium px-4 py-3 transition-colors"
                  >
                    Browse Productions →
                  </Link>
                </div>
              </div>

              {/* ─── Related Articles ──────────────────── */}
              {relatedPosts.length > 0 && (
                <div className="mt-10">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                      More Stories
                    </span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    {relatedPosts.map((rp: any) => {
                      const rpCat = rp.blog_post_categories?.[0]?.blog_categories
                      const rpColor = rpCat ? getCatColor(rpCat.slug) : null
                      const rpImage = getFeaturedImageUrl(rp)
                      return (
                        <Link key={rp.id} href={`/${rp.slug}`} className="group">
                          <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all h-full overflow-hidden">
                            {rpImage && (
                              <div className="relative h-32 overflow-hidden">
                                <Image
                                  src={rpImage}
                                  alt={rp.title}
                                  fill
                                  className="object-cover group-hover:scale-105 transition-transform duration-300"
                                  sizes="33vw"
                                />
                              </div>
                            )}
                            <div className="p-4">
                              {rpColor && rpCat && (
                                <span className={`text-xs font-semibold ${rpColor.text} mb-2 block`}>
                                  {rpCat.name}
                                </span>
                              )}
                              <h4 className="font-bold text-gray-900 leading-snug group-hover:text-accent transition-colors mb-2 line-clamp-3">
                                {rp.title}
                              </h4>
                              <p className="text-sm text-gray-500 line-clamp-2">
                                {generateExcerpt(rp.content, 100)}
                              </p>
                              <div className="text-xs text-gray-400 mt-3">
                                {formatRelativeDate(rp.published_at)}
                              </div>
                            </div>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              )}
            </article>

            {/* ─── Sidebar ──────────────────────────────── */}
            <aside className="lg:w-72 flex-shrink-0 space-y-5">
              {/* Membership CTA */}
              <div className="bg-white rounded-xl border border-gray-200 p-5 text-center">
                <div className="w-12 h-12 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="font-bold text-gray-900 mb-1">Join Production List</h3>
                <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                  Full access to contacts, crew details, and all production listings.
                </p>
                <Link
                  href="/membership-plans"
                  className="block bg-accent hover:bg-accent-dark text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                >
                  See Plans &amp; Pricing
                </Link>
                <p className="text-xs text-gray-400 mt-2">Starting at $38.85/month</p>
              </div>

              {/* Trending Productions */}
              <Suspense fallback={
                <div className="bg-white rounded-xl border border-gray-200 p-5 animate-pulse">
                  <div className="h-4 bg-gray-200 rounded w-2/3 mb-4" />
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <div className="w-5 h-5 rounded-full bg-gray-100" />
                      <div className="h-3 bg-gray-100 rounded flex-1" />
                    </div>
                  ))}
                </div>
              }>
                <TrendingSearches variant="sidebar" limit={8} />
              </Suspense>

              {/* News Categories */}
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="font-semibold text-gray-900 mb-3 text-sm">News Categories</h3>
                <div className="space-y-1.5">
                  {Object.entries(CAT_COLORS).map(([catSlug, colors]) => (
                    <Link
                      key={catSlug}
                      href={`/blog?category=${catSlug}`}
                      className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 transition-colors py-1"
                    >
                      <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                      {catSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                    </Link>
                  ))}
                </div>
                <Link
                  href="/blog"
                  className="block text-accent hover:underline text-sm font-medium mt-4 pt-3 border-t border-gray-100"
                >
                  &larr; All articles
                </Link>
              </div>
            </aside>
          </div>
        </div>
      </>
    )
  }

  // Try page
  const page = await getPageBySlug(slug)
  if (page) {
    return (
      <div className="page-wrap py-8">
        <div className="bg-white rounded-xl border border-gray-200 p-6 lg:p-10 max-w-4xl">
          <h1 className="text-3xl font-bold text-primary mb-6">{page.title}</h1>
          <div
            className="prose prose-lg max-w-none prose-headings:text-gray-900 prose-p:text-gray-700 prose-a:text-accent"
            dangerouslySetInnerHTML={{ __html: rewriteContentImageUrls(page.content ?? '') }}
          />
        </div>
      </div>
    )
  }

  notFound()
}
