import type { Metadata } from 'next'
import { BlogPostForm } from '@/components/admin/forms/BlogPostForm'
import { getAllBlogCategories } from '@/lib/admin-queries'

export const metadata: Metadata = { title: 'New Post' }

export default async function NewBlogPostPage() {
  const allCategories = await getAllBlogCategories()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Blog Post</h1>
      <BlogPostForm allCategories={allCategories} postCategoryIds={[]} />
    </div>
  )
}
