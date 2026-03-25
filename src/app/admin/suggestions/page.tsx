import type { Metadata } from 'next'
import { createAdminClient } from '@/lib/supabase/server'
import { SuggestionsClient } from './SuggestionsClient'

export const metadata: Metadata = { title: 'Edit Suggestions' }

export default async function SuggestionsPage() {
  const supabase = createAdminClient()

  const { data: suggestions, error } = await supabase
    .from('edit_suggestions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Edit Suggestions</h1>
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">
          Could not load suggestions. Make sure the <code>edit_suggestions</code> table exists in Supabase.
        </div>
      </div>
    )
  }

  const pending = suggestions?.filter((s: any) => s.status === 'pending') ?? []
  const reviewed = suggestions?.filter((s: any) => s.status !== 'pending') ?? []

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Edit Suggestions</h1>
      <SuggestionsClient initialPending={pending} initialReviewed={reviewed} />
    </div>
  )
}
