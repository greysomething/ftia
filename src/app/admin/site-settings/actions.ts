'use server'

import { revalidatePath } from 'next/cache'
import { requireAdmin } from '@/lib/auth'
import { saveFeatureFlags } from '@/lib/feature-flags'

export async function updateFeatureFlags(prevState: any, formData: FormData) {
  await requireAdmin()

  try {
    await saveFeatureFlags({
      pitch_marketplace_enabled: formData.get('pitch_marketplace_enabled') === 'on',
    })
    // Public pages and admin banners both read this — invalidate broadly.
    revalidatePath('/', 'layout')
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to save settings.' }
  }
}
