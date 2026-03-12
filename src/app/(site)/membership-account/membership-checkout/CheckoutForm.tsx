'use client'

import { useState } from 'react'
import type { MembershipLevel } from '@/types/database'

interface Props {
  level: MembershipLevel
  userEmail: string
}

export function CheckoutForm({ level, userEmail }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCheckout() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ levelId: level.id }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'Unable to start checkout. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const period = level.cycle_period === 'Year' ? '/year' : '/month'
  const perMonth = level.cycle_period === 'Year'
    ? `$${(level.billing_amount / 12).toFixed(2)}/mo`
    : `$${level.billing_amount.toFixed(2)}/mo`

  return (
    <div className="white-bg p-8">
      {/* Order summary */}
      <div className="border rounded-lg p-4 mb-6 bg-gray-50">
        <h2 className="font-semibold mb-3">Order Summary</h2>
        <div className="flex justify-between text-sm mb-1">
          <span>{level.name}</span>
          <span className="font-medium">${level.initial_payment.toFixed(2)}</span>
        </div>
        {level.initial_payment !== level.billing_amount && (
          <p className="text-xs text-gray-500">
            Then ${level.billing_amount.toFixed(2)}{period} ({perMonth})
          </p>
        )}
        <div className="border-t mt-3 pt-3 flex justify-between font-semibold">
          <span>Due today:</span>
          <span>${level.initial_payment.toFixed(2)}</span>
        </div>
      </div>

      <p className="text-sm text-gray-600 mb-6">
        You will be redirected to Stripe&apos;s secure checkout to complete payment.
        Your account email is <strong>{userEmail}</strong>.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">{error}</div>
      )}

      <button
        onClick={handleCheckout}
        disabled={loading}
        className="btn-accent w-full justify-center text-base py-3"
      >
        {loading ? 'Redirecting to Stripe…' : `Pay $${level.initial_payment.toFixed(2)} — Start Membership`}
      </button>

      <p className="text-xs text-gray-400 text-center mt-4">
        🔒 Secure payment powered by Stripe. Cancel anytime.
      </p>
    </div>
  )
}
