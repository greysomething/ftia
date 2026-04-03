import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { getAdminBlogPostById, getAllBlogCategories } from '@/lib/admin-queries'
import { BlogPostForm } from '@/components/admin/forms/BlogPostForm'
import { StatusBar } from '@/components/admin/StatusBar'

export const metadata: Metadata = { title: 'Edit Post' }

interface Props { params: Promise<{ id: string }> }

function getBackTab(post: any) {
  if (post.visibility === 'private') return { tab: 'trash', label: 'Trash' }
  if (post.visibility === 'draft') return { tab: 'drafts', label: 'Drafts' }
  if (post.visibility === 'publish' && post.published_at && new Date(post.published_at) > new Date()) {
    return { tab: 'scheduled', label: 'Scheduled' }
  }
  if (post.visibility === 'publish') return { tab: 'published', label: 'Published' }
  return { tab: 'all', label: 'All Posts' }
}

export default async function EditBlogPostPage({ params }: Props) {
  const { id } = await params
  const [post, allCategories] = await Promise.all([
    getAdminBlogPostById(Number(id)).catch(() => null),
    getAllBlogCategories(),
  ])
  if (!post) notFound()

  const postCategoryIds = (post as any).blog_post_categories?.map(
    (bpc: any) => bpc.category_id
  ) ?? []

  const back = getBackTab(post)

  return (
    <div>
      <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-4">
        <Link href="/admin/blog" className="hover:text-[#3ea8c8] transition-colors">Blog</Link>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <Link href={`/admin/blog?tab=${back.tab}`} className="hover:text-[#3ea8c8] transition-colors">{back.label}</Link>
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        <span className="text-gray-600 truncate max-w-xs">{(post as any).title || 'Untitled'}</span>
      </nav>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Edit Blog Post</h1>
      <StatusBar
        visibility={(post as any).visibility}
        updatedAt={(post as any).updated_at ?? (post as any).published_at}
        type="blog post"
      />
      <BlogPostForm post={post} allCategories={allCategories} postCategoryIds={postCategoryIds} />
    </div>
  )
}
