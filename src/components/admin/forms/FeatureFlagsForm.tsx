'use client'

import { useActionState, useState } from 'react'
import { updateFeatureFlags } from '@/app/admin/site-settings/actions'
import type { FeatureFlags } from '@/lib/feature-flags'

interface Props {
  flags: FeatureFlags
}

export function FeatureFlagsForm({ flags }: Props) {
  const [state, formAction, isPending] = useActionState(updateFeatureFlags, null)
  const [pitchEnabled, setPitchEnabled] = useState(flags.pitch_marketplace_enabled)

  return (
    <form action={formAction} className="space-y-6 max-w-3xl">
      {state?.error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {state.error}
        </div>
      )}
      {state?.success && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          Settings saved successfully.
        </div>
      )}

      <section className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">Feature Flags</h2>
        <p className="text-sm text-gray-500 mb-6">
          Toggle individual features on or off across the site. Admins always see hidden features.
        </p>

        <div className="space-y-4">
          {/* Pitch Marketplace */}
          <div className="flex items-start justify-between gap-6 pb-4 border-b border-gray-100">
            <div className="flex-1">
              <div className="font-medium text-gray-900">Pitch Marketplace</div>
              <p className="text-sm text-gray-500 mt-1">
                Public-facing pitch listings, detail pages, and the &ldquo;My Pitches&rdquo;
                area for members. When OFF, the routes return 404 to non-admins and
                the navigation links are hidden. Admins can always preview.
              </p>
            </div>
            <label className="inline-flex items-center cursor-pointer flex-shrink-0 mt-1">
              <input
                type="checkbox"
                name="pitch_marketplace_enabled"
                checked={pitchEnabled}
                onChange={(e) => setPitchEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="relative w-11 h-6 bg-gray-200 peer-checked:bg-[#3ea8c8] rounded-full transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border after:border-gray-300 after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-5 peer-checked:after:border-white" />
              <span className="ml-3 text-sm font-medium text-gray-700 w-8">
                {pitchEnabled ? 'On' : 'Off'}
              </span>
            </label>
          </div>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending}
          className="btn-primary disabled:opacity-50"
        >
          {isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </form>
  )
}
