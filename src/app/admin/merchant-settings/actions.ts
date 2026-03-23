'use server'

import { requireAdmin } from '@/lib/auth'
import { saveStripeSettings, type StripeSettings } from '@/lib/stripe-settings'
import { revalidatePath } from 'next/cache'

export async function updateStripeSettings(prevState: any, formData: FormData) {
  await requireAdmin()

  const mode = formData.get('mode') === 'test' ? 'test' : 'live' as const

  const settings: StripeSettings = {
    mode,
    live_secret_key: (formData.get('live_secret_key') as string)?.trim() ?? '',
    live_publishable_key: (formData.get('live_publishable_key') as string)?.trim() ?? '',
    live_webhook_secret: (formData.get('live_webhook_secret') as string)?.trim() ?? '',
    test_secret_key: (formData.get('test_secret_key') as string)?.trim() ?? '',
    test_publishable_key: (formData.get('test_publishable_key') as string)?.trim() ?? '',
    test_webhook_secret: (formData.get('test_webhook_secret') as string)?.trim() ?? '',
  }

  // Validate that the active mode has keys
  if (mode === 'live' && !settings.live_secret_key) {
    return { error: 'Live secret key is required when in Live mode.' }
  }
  if (mode === 'test' && !settings.test_secret_key) {
    return { error: 'Test secret key is required when in Test mode.' }
  }

  try {
    await saveStripeSettings(settings)
    revalidatePath('/admin/merchant-settings')
    return { success: true }
  } catch (err: any) {
    return { error: err.message || 'Failed to save settings.' }
  }
}
