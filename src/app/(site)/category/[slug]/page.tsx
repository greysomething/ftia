import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getBlogPostsByCategory, getBlogCategories } from '@/lib/queries'
import { Pagination } from '@/components/Pagination'
import {
  formatRelativeDate,
  generateExcerpt,
  estimateReadTime,
  getFeaturedImageUrl,
} from '@/lib/utils'

/* ── Category colors ──────────────────────────────────── */
const CAT_COLORS: Record<string, { bg: string; text: string; dot: string; heroBg: string }> = {
  'project-alerts': { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500', heroBg: 'bg-red-600' },
  'industry-news': { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500', heroBg: 'bg-blue-600' },
  'casting-calls': { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500', heroBg: 'bg-amber-600' },
  'film-jobs': { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500', heroBg: 'bg-emerald-600' },
  'how-to': { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500', heroBg: 'bg-purple-600' },
  'production-list': { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500', heroBg: 'bg-sky-600' },
}

function getCatColor(slug: string) {
  return CAT_COLORS[slug] ?? { bg: 'bg-gray-50', text: 'text-gray-700', dot: 'bg-gray-500', heroBg: 'bg-gray-600' }
}

function primaryCategory(post: any): { name: string; slug: string } | null {
  return post.blog_post_categories?.[0]?.blog_categories ?? null
}

interface Props {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const result = await getBlogPostsByCategory(slug)
  if (!result) return { title: 'Not Found' }
  return {
    title: `${result.category.name} | Production News`,
    description: result.category.description ?? `Articles about ${result.category.name} in the film and television industry.`,
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const page = parseInt(sp.page ?? '1', 10)

  const [result, categories] = await Promise.all([
    getBlogPostsByCategory(slug, page),
    getBlogCategories(),
  ])
  if (!result) notFound()

  const catColor = getCatColor(slug)
  const heroPost = page === 1 && result.posts.length > 0 ? result.posts[0] : null
  const gridPosts = page === 1 ? result.posts.slice(1) : result.posts

  return (
    <>
      {/* ─── Category Header ─────────────────────────────── */}
      <div className={`${catColor.heroBg}`}>
        <div className="page-wrap py-8 md:py-10">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <div>
              <p className="text-white/60 text-sm font-medium uppercase tracking-widest mb-2">
                Production List News
              </p>
              <h1 className="text-3xl md:text-4xl font-bold text-white">
                {result.category.name}
              </h1>
              {result.category.description && (
                <p className="text-white/70 mt-2 max-w-xl text-sm">
                  {result.category.description}
                </p>
              )}
              <p className="text-white/50 text-sm mt-2">
                {result.total.toLocaleString()} {result.total === 1 ? 'article' : 'articles'}
              </p>
            </div>
          </div>

          {/* Category navigation */}
          <div className="flex items-center gap-2 mt-6 overflow-x-auto scrollbar-hide pb-1">
            <Link
              href="/blog"
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            >
              All News
            </Link>
            {(categories as any[])?.map((cat: any) => (
              <Link
                key={cat.slug}
                href={`/category/${cat.slug}`}
                className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  cat.slug === slug
                    ? 'bg-white text-gray-900'
                    : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
                }`}
              >
                {cat.name}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="page-wrap py-8">
        {/* ─── Hero Post ─────────────────────────────────── */}
        {heroPost && (
          <div className="mb-10">
            <Link href={`/${heroPost.slug}`} className="group block">
              <div className="bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:shadow-md transition-all overflow-hidden md:flex">
                {/* Hero image */}
                {getFeaturedImageUrl(heroPost) ? (
                  <div className="relative h-56 md:h-72 md:w-1/2 flex-shrink-0 overflow-hidden">
                    <Image
                      src={getFeaturedImageUrl(heroPost)!}
                      alt={heroPost.title}
                      fill
                      className="object-cover group-hover:scale-105 transition-transform duration-500"
                      sizes="(max-width: 768px) 100vw, 50vw"
                      priority
                    />
                  </div>
                ) : (
                  <div className={`h-56 md:h-72 md:w-1/2 flex-shrink-0 ${catColor.heroBg} flex items-center justify-center`}>
                    <span className="text-white/30 text-6xl font-bold">{result.category.name.charAt(0)}</span>
                  </div>
                )}

                <div className="p-6 md:p-8 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-3">
                    <span className={`text-[11px] font-bold uppercase tracking-wider ${catColor.text}`}>
                      {result.category.name}
                    </span>
                    <span className="text-xs text-gray-300">
                      {estimateReadTime(heroPost.content)}m read
                    </span>
                  </div>
                  <h2 className="text-xl md:text-2xl font-bold text-gray-900 leading-snug group-hover:text-accent transition-colors mb-3">
                    {heroPost.title}
                  </h2>
                  <p className="text-sm text-gray-500 line-clamp-3 mb-4">
                    {generateExcerpt(heroPost.content, 200)}
                  </p>
                  <div className="flex items-center justify-between text-xs text-gray-400">
                    <time>{formatRelativeDate(heroPost.published_at)}</time>
                    <span className="text-accent font-medium group-hover:translate-x-1 transition-transform">
                      Read article &rarr;
                    </span>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        )}

        {/* ─── Article Grid ──────────────────────────────── */}
        {gridPosts.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {gridPosts.map((post: any) => (
              <ArticleCard key={post.id} post={post} categorySlug={slug} />
            ))}
          </div>
        )}

        {result.posts.length === 0 && (
          <div className="text-center py-16">
            <p className="text-gray-400 text-lg">No articles in this category yet.</p>
            <Link href="/blog" className="text-accent hover:underline text-sm mt-2 inline-block">
              Browse all news &rarr;
            </Link>
          </div>
        )}

        <Pagination current={page} total={result.total} perPage={20} basePath={`/category/${slug}`} />
      </div>
    </>
  )
}

/* ─── Article Card Component ───────────────────────────── */
function ArticleCard({ post, categorySlug }: { post: any; categorySlug: string }) {
  const cat = primaryCategory(post)
  const catColor = cat ? getCatColor(cat.slug) : getCatColor(categorySlug)
  const imageUrl = getFeaturedImageUrl(post)

  return (
    <article>
      <Link href={`/${post.slug}`} className="group block h-full">
        <div className="bg-white rounded-lg border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all h-full flex flex-col overflow-hidden">
          {/* Featured Image */}
          {imageUrl ? (
            <div className="relative h-40 overflow-hidden">
              <Image
                src={imageUrl}
                alt={post.title}
                fill
                className="object-cover group-hover:scale-105 transition-transform duration-300"
                sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
              />
            </div>
          ) : (
            <div className={`h-1 ${catColor.dot} rounded-t-lg`} />
          )}

          <div className="p-4 flex flex-col flex-1">
            {/* Category + read time */}
            <div className="flex items-center gap-2 mb-2">
              <span className={`text-[11px] font-bold uppercase tracking-wider ${catColor.text}`}>
                {cat?.name ?? categorySlug.replace(/-/g, ' ')}
              </span>
              <span className="text-xs text-gray-300 ml-auto">{estimateReadTime(post.content)}m</span>
            </div>

            {/* Title */}
            <h3 className="font-bold text-sm text-gray-900 leading-snug group-hover:text-accent transition-colors mb-2 flex-1">
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
