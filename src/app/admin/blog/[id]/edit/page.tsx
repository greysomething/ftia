import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getAdminBlogPostById, getAllBlogCategories } from '@/lib/admin-queries'
import { BlogPostForm } from '@/components/admin/forms/BlogPostForm'
import { StatusBar } from '@/components/admin/StatusBar'

export const metadata: Metadata = { title: 'Edit Post' }

interface Props { params: Promise<{ id: string }> }

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

  return (
    <div>
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
