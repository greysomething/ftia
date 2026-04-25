import type { Metadata } from 'next'
import { requireAdmin } from '@/lib/auth'
import { getFeatureFlags } from '@/lib/feature-flags'
import { FeatureFlagsForm } from '@/components/admin/forms/FeatureFlagsForm'

export const metadata: Metadata = { title: 'Site Settings | Admin' }

export default async function SiteSettingsPage() {
  await requireAdmin()
  const flags = await getFeatureFlags()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Site Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Toggle site-wide features. Changes take effect immediately for all visitors.
        </p>
      </div>

      <FeatureFlagsForm flags={flags} />
    </div>
  )
}
