/**
 * Catch-all for WordPress /%postname%/ permalink structure.
 * WordPress uses a flat namespace — blog posts AND pages share the same URL depth.
 * We check blog_posts first, then pages, then 404.
 *
 * Known static pages (served here): blog, contact, privacy-policy, terms-of-service,
 * what-is-production-list, my-account, production-resources, membership-plans,
 * membership-offers, monthly-membership-offer, welcome, thank-you, current-production-list, home
 *
 * These specific page slugs could also be their own route files if needed.
 */

import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { getBlogPostBySlug, getPageBySlug, getBlogSlugs } from '@/lib/queries'
import { formatDate, getMediaUrl } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
}

// Known page slugs that redirect elsewhere
const REDIRECTS: Record<string, string> = {
  'current-production-list': '/productions',
  'home': '/',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params

  const post = await getBlogPostBySlug(slug)
  if (post) {
    return {
      title: post.title,
      description: post.excerpt ? post.excerpt.replace(/<[^>]+>/g, '').slice(0, 160) : undefined,
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

    return (
      <div className="page-wrap py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          <article className="flex-1">
            <div className="white-bg p-6 lg:p-8">
              {/* Categories */}
              {categories.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {categories.map((cat: any) => (
                    <Link
                      key={cat.blog_categories.id}
                      href={`/category/${cat.blog_categories.slug}`}
                      className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded"
                    >
                      {cat.blog_categories.name}
                    </Link>
                  ))}
                </div>
              )}

              <h1 className="text-3xl font-bold text-gray-900 mb-3">{post.title}</h1>

              <time className="text-sm text-gray-400 block mb-6">
                {formatDate(post.published_at)}
              </time>

              {post.thumbnail_id && p.media && (
                <div className="mb-6">
                  <img
                    src={getMediaUrl(p.media.storage_path, p.media.original_url)}
                    alt={p.media.alt_text ?? post.title}
                    className="w-full rounded-lg"
                  />
                </div>
              )}

              <div
                className="prose prose-sm sm:prose max-w-none"
                dangerouslySetInnerHTML={{ __html: post.content ?? '' }}
              />

              {tags.length > 0 && (
                <div className="mt-8 pt-6 border-t">
                  <div className="flex flex-wrap gap-2">
                    {tags.map((tag: any) => (
                      <Link
                        key={tag.blog_tags.id}
                        href={`/tag/${tag.blog_tags.slug}`}
                        className="text-xs text-gray-500 hover:text-primary border border-gray-200 px-2 py-1 rounded"
                      >
                        #{tag.blog_tags.name}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </article>

          {/* Sidebar */}
          <aside className="lg:w-64 flex-shrink-0">
            <div className="white-bg p-4">
              <h3 className="font-semibold text-primary mb-3">More News</h3>
              <Link href="/blog" className="text-sm text-primary hover:underline">
                View all articles →
              </Link>
            </div>
          </aside>
        </div>
      </div>
    )
  }

  // Try page
  const page = await getPageBySlug(slug)
  if (page) {
    return (
      <div className="page-wrap py-8">
        <div className="white-bg p-6 lg:p-8 max-w-4xl">
          <h1 className="text-3xl font-bold text-primary mb-6">{page.title}</h1>
          <div
            className="prose prose-sm sm:prose max-w-none"
            dangerouslySetInnerHTML={{ __html: page.content ?? '' }}
          />
        </div>
      </div>
    )
  }

  notFound()
}
