import type { Metadata } from 'next'
import { getStripeSettings } from '@/lib/stripe-settings'
import { MerchantSettingsForm } from '@/components/admin/forms/MerchantSettingsForm'

export const metadata: Metadata = { title: 'Merchant Settings' }

export default async function MerchantSettingsPage() {
  const settings = await getStripeSettings()

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Merchant Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your Stripe API keys, toggle between test and live mode, and sync products
        </p>
      </div>

      <MerchantSettingsForm settings={settings} />
    </div>
  )
}
