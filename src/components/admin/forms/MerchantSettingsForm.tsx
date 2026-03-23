'use client'

import { useActionState, useState } from 'react'
import { updateStripeSettings } from '@/app/admin/merchant-settings/actions'

interface Props {
  settings: {
    mode: 'test' | 'live'
    live_secret_key: string
    live_publishable_key: string
    live_webhook_secret: string
    test_secret_key: string
    test_publishable_key: string
    test_webhook_secret: string
  }
}

function maskKey(key: string) {
  if (!key || key.length < 12) return key
  return key.slice(0, 8) + '•'.repeat(Math.min(key.length - 12, 30)) + key.slice(-4)
}

export function MerchantSettingsForm({ settings }: Props) {
  const [state, formAction, isPending] = useActionState(updateStripeSettings, null)
  const [mode, setMode] = useState<'test' | 'live'>(settings.mode)
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState<any>(null)

  // Show/hide keys
  const [showLiveSecret, setShowLiveSecret] = useState(false)
  const [showTestSecret, setShowTestSecret] = useState(false)

  async function handleSync() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const res = await fetch('/api/admin/stripe/sync-products', { method: 'POST' })
      const data = await res.json()
      setSyncResult(data)
    } catch (err: any) {
      setSyncResult({ error: err.message })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <form action={formAction} className="space-y-6">
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

        {/* Mode Toggle */}
        <div className="admin-card">
          <h2 className="text-base font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-[#635BFF]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.18l-.897 5.555C5.014 22.77 7.718 24 11.51 24c2.624 0 4.862-.649 6.334-1.838 1.588-1.28 2.397-3.178 2.397-5.637 0-4.145-2.543-5.827-6.266-7.376z"/>
            </svg>
            Stripe Mode
          </h2>

          <div className="flex rounded-lg overflow-hidden border border-gray-300 w-fit">
            <button
              type="button"
              onClick={() => setMode('live')}
              className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                mode === 'live'
                  ? 'bg-green-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Live Mode
            </button>
            <button
              type="button"
              onClick={() => setMode('test')}
              className={`px-6 py-2.5 text-sm font-medium transition-colors ${
                mode === 'test'
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
            >
              Test Mode
            </button>
          </div>
          <input type="hidden" name="mode" value={mode} />

          {mode === 'test' && (
            <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-lg text-sm text-orange-700 flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Test Mode — No real charges will be processed. Use Stripe test cards.
            </div>
          )}
        </div>

        {/* Live Keys */}
        <div className="admin-card space-y-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500"></span>
            Live Keys
          </h2>

          <div>
            <label className="form-label">Publishable Key</label>
            <input name="live_publishable_key" defaultValue={settings.live_publishable_key}
              className="form-input font-mono text-sm" placeholder="pk_live_..." />
          </div>

          <div>
            <label className="form-label flex items-center gap-2">
              Secret Key
              <button type="button" onClick={() => setShowLiveSecret(!showLiveSecret)}
                className="text-xs text-primary hover:underline">
                {showLiveSecret ? 'Hide' : 'Show'}
              </button>
            </label>
            {showLiveSecret ? (
              <input name="live_secret_key" defaultValue={settings.live_secret_key}
                className="form-input font-mono text-sm" placeholder="sk_live_..." />
            ) : (
              <>
                <div className="form-input font-mono text-sm text-gray-400 bg-gray-50">
                  {settings.live_secret_key ? maskKey(settings.live_secret_key) : 'Not set'}
                </div>
                <input type="hidden" name="live_secret_key" value={settings.live_secret_key} />
              </>
            )}
          </div>

          <div>
            <label className="form-label">Webhook Secret</label>
            <input name="live_webhook_secret" defaultValue={settings.live_webhook_secret}
              className="form-input font-mono text-sm" placeholder="whsec_..." />
          </div>
        </div>

        {/* Test Keys */}
        <div className="admin-card space-y-4">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-orange-400"></span>
            Test Keys
          </h2>

          <div>
            <label className="form-label">Publishable Key</label>
            <input name="test_publishable_key" defaultValue={settings.test_publishable_key}
              className="form-input font-mono text-sm" placeholder="pk_test_..." />
          </div>

          <div>
            <label className="form-label flex items-center gap-2">
              Secret Key
              <button type="button" onClick={() => setShowTestSecret(!showTestSecret)}
                className="text-xs text-primary hover:underline">
                {showTestSecret ? 'Hide' : 'Show'}
              </button>
            </label>
            {showTestSecret ? (
              <input name="test_secret_key" defaultValue={settings.test_secret_key}
                className="form-input font-mono text-sm" placeholder="sk_test_..." />
            ) : (
              <>
                <div className="form-input font-mono text-sm text-gray-400 bg-gray-50">
                  {settings.test_secret_key ? maskKey(settings.test_secret_key) : 'Not set'}
                </div>
                <input type="hidden" name="test_secret_key" value={settings.test_secret_key} />
              </>
            )}
          </div>

          <div>
            <label className="form-label">Webhook Secret</label>
            <input name="test_webhook_secret" defaultValue={settings.test_webhook_secret}
              className="form-input font-mono text-sm" placeholder="whsec_..." />
          </div>
        </div>

        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </form>

      {/* ── Sync Products from Stripe ── */}
      <div className="admin-card space-y-4">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync Products from Stripe
        </h2>
        <p className="text-sm text-gray-500">
          Pull active subscription prices from your Stripe account and automatically create/update membership plans.
          Existing plans matched by Stripe Price ID will be updated; new prices will create new plans.
        </p>
        <div className="flex items-center gap-3">
          <button type="button" onClick={handleSync} disabled={syncing}
            className="btn-primary flex items-center gap-2">
            {syncing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Syncing…
              </>
            ) : (
              'Sync from Stripe'
            )}
          </button>
          <span className="text-xs text-gray-400">
            Currently using <strong>{mode}</strong> mode keys
          </span>
        </div>

        {syncResult && (
          <div className={`p-4 rounded-lg border text-sm ${
            syncResult.error
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-green-50 border-green-200 text-green-700'
          }`}>
            {syncResult.error ? (
              <p>Error: {syncResult.error}</p>
            ) : (
              <div>
                <p className="font-medium mb-2">
                  Sync complete — {syncResult.total} prices found
                </p>
                <ul className="space-y-1">
                  <li>Updated: {syncResult.synced} plans</li>
                  <li>Created: {syncResult.created} new plans</li>
                  <li>Skipped: {syncResult.skipped} (non-recurring or invalid)</li>
                </ul>
                {syncResult.results?.length > 0 && (
                  <div className="mt-3 border-t border-green-200 pt-2 space-y-1">
                    {syncResult.results.map((r: any, i: number) => (
                      <p key={i} className="text-xs">
                        <span className={`font-medium ${r.action === 'created' ? 'text-blue-600' : r.action === 'error' ? 'text-red-600' : 'text-green-600'}`}>
                          {r.action}
                        </span>
                        {' '}{r.name}
                        <span className="text-gray-400 ml-1">({r.priceId})</span>
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Webhook Info ── */}
      <div className="admin-card space-y-3">
        <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Webhook Configuration
        </h2>
        <p className="text-sm text-gray-500">
          Set this URL as your webhook endpoint in your{' '}
          <a href="https://dashboard.stripe.com/webhooks" target="_blank" rel="noopener noreferrer"
            className="text-primary hover:underline">Stripe Dashboard</a>:
        </p>
        <div className="flex items-center gap-2 bg-gray-50 p-3 rounded-lg border">
          <code className="text-sm font-mono text-gray-700 flex-1">
            https://productionlist.com/api/stripe/webhook
          </code>
          <button type="button" onClick={() => navigator.clipboard.writeText('https://productionlist.com/api/stripe/webhook')}
            className="text-xs btn-outline py-1 px-2">Copy</button>
        </div>
        <div className="text-xs text-gray-400 space-y-1">
          <p><strong>Events to listen for:</strong></p>
          <ul className="list-disc list-inside space-y-0.5">
            <li>checkout.session.completed</li>
            <li>invoice.payment_succeeded</li>
            <li>invoice.payment_failed</li>
            <li>customer.subscription.deleted</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
