import type { Metadata } from 'next'
import Link from 'next/link'
import Image from 'next/image'
import { Suspense } from 'react'
import { getBlogPosts, getBlogCategories } from '@/lib/queries'
import { Pagination } from '@/components/Pagination'
import { TrendingSearches } from '@/components/TrendingSearches'
import {
  formatRelativeDate,
  formatDate,
  generateExcerpt,
  estimateReadTime,
  getFeaturedImageUrl,
} from '@/lib/utils'

// Revalidate every 60s so scheduled posts appear/disappear on time
export const revalidate = 60

export const metadata: Metadata = {
  title: 'Production News | Film & Television Industry Updates',
  description:
    'Breaking news, project alerts, casting calls, and industry updates for film and television professionals.',
}

interface Props {
  searchParams: Promise<{ page?: string; category?: string }>
}

/* ── Category colors ──────────────────────────────────── */
const CAT_COLORS: Record<string, { bg: string; text: string; dot: string; border: string; heroBg: string }> = {
  'project-alerts': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', border: 'border-red-500', heroBg: 'bg-red-600' },
  'industry-news': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', border: 'border-blue-500', heroBg: 'bg-blue-600' },
  'casting-calls': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', border: 'border-amber-500', heroBg: 'bg-amber-600' },
  'film-jobs': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', border: 'border-emerald-500', heroBg: 'bg-emerald-600' },
  'how-to': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', border: 'border-purple-500', heroBg: 'bg-purple-600' },
  'production-list': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500', border: 'border-sky-500', heroBg: 'bg-sky-600' },
}

function getCatColor(slug: string) {
  return CAT_COLORS[slug] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500', border: 'border-gray-500', heroBg: 'bg-gray-600' }
}

function primaryCategory(post: any): { name: string; slug: string } | null {
  return post.blog_post_categories?.[0]?.blog_categories ?? null
}

export default async function BlogPage({ searchParams }: Props) {
  const params = await searchParams
  const page = parseInt(params.page ?? '1', 10)
  const activeCategory = params.category ?? null

  const [blogResult, categories] = await Promise.all([
    getBlogPosts(page, { perPage: 24, category: activeCategory ?? undefined }),
    getBlogCategories(),
  ])
  const posts = blogResult.posts as any[]
  const { total, perPage } = blogResult

  const isFirstPage = page === 1 && !activeCategory

  // Split: hero (1) + sidebar headlines (6) + grid
  const heroPost = isFirstPage ? posts[0] : null
  const sidebarHeadlines = isFirstPage ? posts.slice(1, 7) : []
  const gridPosts = isFirstPage ? posts.slice(7) : posts

  return (
    <>
      {/* ─── Breaking News Ticker ──────────────────────────── */}
      {isFirstPage && posts.length > 0 && (
        <div className="bg-primary-dark border-b border-white/10">
          <div className="page-wrap">
            <div className="flex items-center py-2 gap-4 overflow-hidden">
              <span className="flex-shrink-0 bg-red-600 text-white text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded">
                Breaking
              </span>
              <div className="flex items-center gap-6 overflow-x-auto scrollbar-hide">
                {posts.slice(0, 5).map((p: any, i: number) => (
                  <Link
                    key={p.id}
                    href={`/${p.slug}`}
                    className="text-white/70 hover:text-white text-xs whitespace-nowrap transition-colors flex items-center gap-2"
                  >
                    {i > 0 && <span className="text-white/20">|</span>}
                    <span className="font-medium">{p.title.length > 60 ? p.title.substring(0, 60) + '...' : p.title}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Branded Header ─────────────────────────────── */}
      <div className="bg-primary">
        <div className="page-wrap py-6 md:py-8">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <p className="text-accent font-bold text-sm uppercase tracking-widest">
                  Production List News
                </p>
                <span className="hidden md:inline-flex items-center gap-1.5 bg-white/10 text-white/50 text-[10px] font-medium uppercase tracking-wider px-2 py-0.5 rounded-full">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  Live
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-white leading-tight">
                Industry News &amp; Alerts
              </h1>
              <p className="text-white/50 mt-1.5 text-sm max-w-xl">
                Breaking project alerts, crew calls, and industry intelligence for
                film &amp; television professionals.
              </p>
            </div>
            <div className="text-white/30 text-xs font-medium">
              {total.toLocaleString()} articles
            </div>
          </div>
        </div>
        <div className="h-1 bg-accent" />
      </div>

      {/* ─── Category Tabs ──────────────────────────────── */}
      <div className="bg-white border-b border-gray-200 sticky top-16 z-40 shadow-sm">
        <div className="page-wrap">
          <nav className="flex items-center gap-1 overflow-x-auto py-2.5 -mx-1 scrollbar-hide">
            <Link
              href="/blog"
              className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                !activeCategory
                  ? 'bg-primary text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              All Stories
            </Link>
            {categories.map((cat: any) => {
              const colors = getCatColor(cat.slug)
              const isActive = activeCategory === cat.slug
              return (
                <Link
                  key={cat.id}
                  href={`/blog?category=${cat.slug}`}
                  className={`px-4 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                    isActive
                      ? `${colors.bg} ${colors.text}`
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {cat.name}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>

      <div className="page-wrap py-6">
        {posts.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <p className="text-lg">No articles found in this category.</p>
            <Link href="/blog" className="text-accent hover:underline mt-2 inline-block">
              &larr; View all stories
            </Link>
          </div>
        ) : (
          <>
            {/* ─── Hero + Top Stories + Headlines (page 1) ── */}
            {isFirstPage && heroPost && (
              <div className="mb-8">
                {/* Hero row: main story + side headlines */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Hero Article — spans 2 columns */}
                  <div className="lg:col-span-2">
                    <article className="h-full">
                      <Link href={`/${heroPost.slug}`} className="group block h-full">
                        <div className="rounded-xl overflow-hidden hover:shadow-xl transition-shadow h-full relative min-h-[380px]">
                          {/* Featured image background */}
                          {(() => {
                            const heroImg = getFeaturedImageUrl(heroPost)
                            return heroImg ? (
                              <>
                                <Image
                                  src={heroImg}
                                  alt={heroPost.title}
                                  fill
                                  className="object-cover"
                                  sizes="(max-width: 1024px) 100vw, 66vw"
                                  priority
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-black/20" />
                              </>
                            ) : (
                              <div className="absolute inset-0 bg-primary" />
                            )
                          })()}

                          <div className="relative p-6 md:p-8 flex flex-col justify-end min-h-[320px] lg:min-h-full">
                            {/* Category badge */}
                            <div className="flex items-center gap-3 mb-3">
                              {primaryCategory(heroPost) && (() => {
                                const cat = primaryCategory(heroPost)!
                                const c = getCatColor(cat.slug)
                                return (
                                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${c.heroBg} text-white`}>
                                    {cat.name}
                                  </span>
                                )
                              })()}
                              <span className="text-white/60 text-xs font-medium">
                                {formatRelativeDate(heroPost.published_at)}
                              </span>
                            </div>

                            <h2 className="text-2xl md:text-3xl font-extrabold text-white leading-tight group-hover:text-accent transition-colors mb-3 drop-shadow-sm">
                              {heroPost.title}
                            </h2>

                            <p className="text-white/70 text-base leading-relaxed max-w-2xl mb-4 line-clamp-3 drop-shadow-sm">
                              {generateExcerpt(heroPost.content, 220)}
                            </p>

                            <div className="flex items-center gap-4 text-xs text-white/50">
                              <span>{estimateReadTime(heroPost.content)} min read</span>
                              <span className="flex items-center gap-1.5 text-accent font-semibold group-hover:gap-2.5 transition-all">
                                Read full story
                                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                </svg>
                              </span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    </article>
                  </div>

                  {/* Side Headlines — compact list */}
                  <div className="lg:col-span-1">
                    <div className="bg-white rounded-xl border border-gray-200 h-full">
                      <div className="p-4 border-b border-gray-100">
                        <h3 className="font-bold text-primary text-sm flex items-center gap-2">
                          <svg className="w-4 h-4 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                          </svg>
                          Top Stories
                        </h3>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {sidebarHeadlines.map((post: any, i: number) => {
                          const cat = primaryCategory(post)
                          const catColor = cat ? getCatColor(cat.slug) : null
                          return (
                            <Link key={post.id} href={`/${post.slug}`} className="group block p-4 hover:bg-gray-50 transition-colors">
                              <div className="flex gap-3">
                                <span className="flex-shrink-0 w-6 h-6 rounded bg-gray-100 text-gray-400 text-xs font-bold flex items-center justify-center mt-0.5">
                                  {i + 2}
                                </span>
                                <div className="min-w-0">
                                  {catColor && cat && (
                                    <span className={`text-[10px] font-bold uppercase tracking-wider ${catColor.text} mb-0.5 block`}>
                                      {cat.name}
                                    </span>
                                  )}
                                  <h4 className="text-sm font-semibold text-gray-900 leading-snug group-hover:text-accent transition-colors line-clamp-2">
                                    {post.title}
                                  </h4>
                                  <span className="text-[11px] text-gray-400 mt-1 block">
                                    {formatRelativeDate(post.published_at)}
                                  </span>
                                </div>
                              </div>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            )}

            {/* ─── Main Content + Sidebar ──────────────────── */}
            <div className="flex flex-col lg:flex-row gap-8">
              {/* Main Column */}
              <div className="flex-1 min-w-0">
                {/* Divider */}
                {gridPosts.length > 0 && (
                  <div className="flex items-center gap-4 mb-6">
                    <div className="h-px flex-1 bg-gray-200" />
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
                      {isFirstPage ? 'Latest Stories' : activeCategory ? categories.find((c: any) => c.slug === activeCategory)?.name ?? 'Stories' : 'All Stories'}
                    </span>
                    <div className="h-px flex-1 bg-gray-200" />
                  </div>
                )}

                {/* Article Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {gridPosts.map((post: any, i: number) => (
                    <ArticleCard key={post.id} post={post} featured={!isFirstPage && i < 2} />
                  ))}
                </div>

                <Pagination current={page} total={total} perPage={perPage} basePath="/blog" />
              </div>

              {/* Sidebar */}
              <aside className="lg:w-72 flex-shrink-0 space-y-5">
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

                {/* Membership CTA */}
                <div className="bg-primary rounded-xl p-5 text-center">
                  <div className="w-10 h-10 bg-accent/20 rounded-full flex items-center justify-center mx-auto mb-3">
                    <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="font-bold text-white text-sm mb-1">Get Full Access</h3>
                  <p className="text-white/60 text-xs leading-relaxed mb-4">
                    1,500+ active productions with contacts, crew details, and weekly updated project lists.
                  </p>
                  <Link
                    href="/membership-plans"
                    className="block bg-accent hover:bg-accent-dark text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
                  >
                    View Membership Plans
                  </Link>
                  <p className="text-white/30 text-[10px] mt-2">Starting at $29.95/month</p>
                </div>

                {/* News Categories */}
                <div className="bg-white rounded-xl border border-gray-200 p-5">
                  <h3 className="font-bold text-primary text-sm mb-3">Browse by Topic</h3>
                  <div className="space-y-0.5">
                    {Object.entries(CAT_COLORS).map(([catSlug, colors]) => (
                      <Link
                        key={catSlug}
                        href={`/blog?category=${catSlug}`}
                        className={`flex items-center gap-2.5 text-sm py-2 px-2 rounded-lg transition-colors ${
                          activeCategory === catSlug
                            ? `${colors.bg} ${colors.text} font-semibold`
                            : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                        }`}
                      >
                        <span className={`w-2 h-2 rounded-full ${colors.dot}`} />
                        {catSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
                      </Link>
                    ))}
                  </div>
                  <Link
                    href="/blog"
                    className="block text-accent hover:underline text-xs font-medium mt-3 pt-3 border-t border-gray-100"
                  >
                    &larr; All articles
                  </Link>
                </div>
              </aside>
            </div>
          </>
        )}
      </div>
    </>
  )
}

/* ─── Article Card Component ───────────────────────────── */
function ArticleCard({ post, featured = false }: { post: any; featured?: boolean }) {
  const cat = primaryCategory(post)
  const catColor = cat ? getCatColor(cat.slug) : null
  const imageUrl = getFeaturedImageUrl(post)

  return (
    <article className={featured ? 'md:col-span-1' : ''}>
      <Link href={`/${post.slug}`} className="group block h-full">
        <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all h-full flex flex-col overflow-hidden">
          {/* Featured Image */}
          {imageUrl ? (
            <div className="relative h-36 overflow-hidden">
              <Image
                src={imageUrl}
                alt={post.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </div>
          ) : (
            /* Accent top border if no image */
            catColor ? <div className={`h-0.5 ${catColor.dot} rounded-t-lg`} /> : null
          )}

          <div className="p-4 flex flex-col flex-1">
            {/* Category + read time */}
            <div className="flex items-center gap-2 mb-2">
              {catColor && cat && (
                <span className={`text-[11px] font-bold uppercase tracking-wider ${catColor.text}`}>
                  {cat.name}
                </span>
              )}
              <span className="text-xs text-gray-300 ml-auto">{estimateReadTime(post.content)}m</span>
            </div>

            {/* Title */}
            <h3 className={`font-bold text-gray-900 leading-snug group-hover:text-accent transition-colors mb-2 flex-1 ${featured ? 'text-base' : 'text-sm'}`}>
              {post.title}
            </h3>

            {/* Excerpt */}
            <p className="text-xs text-gray-500 line-clamp-2 mb-3">
              {generateExcerpt(post.content, 100)}
            </p>

            {/* Footer */}
            <div className="flex items-center justify-between text-[11px] text-gray-400 pt-2.5 border-t border-gray-100">
              <time>{formatRelativeDate(post.published_at)}</time>
              <span className="text-accent font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                Read &rarr;
              </span>
            </div>
          </div>
        </div>
      </Link>
    </article>
  )
}
