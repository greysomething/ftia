'use client'

import { useState } from 'react'

interface SubscriptionActionsProps {
  membershipId: number
  subscriptionId: string | null
  status: string
  userName: string
  plans: Array<{ id: number; name: string; stripe_price_id: string | null; billing_amount: string; cycle_period: string }>
  currentLevelId: number
}

export function SubscriptionActions({
  membershipId,
  subscriptionId,
  status,
  userName,
  plans,
  currentLevelId,
}: SubscriptionActionsProps) {
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [showChangePlan, setShowChangePlan] = useState(false)
  const [showRefund, setShowRefund] = useState(false)
  const [showConfirm, setShowConfirm] = useState<string | null>(null)

  async function doAction(action: string, extra?: Record<string, any>) {
    setLoading(true)
    setMessage(null)
    setShowMenu(false)
    setShowConfirm(null)
    try {
      const res = await fetch('/api/admin/manage-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          membershipId,
          subscriptionId,
          ...extra,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage({ text: data.message, type: 'success' })
        setTimeout(() => window.location.reload(), 1500)
      } else {
        setMessage({ text: data.error, type: 'error' })
      }
    } catch {
      setMessage({ text: 'Network error', type: 'error' })
    } finally {
      setLoading(false)
    }
  }

  const hasStripe = !!subscriptionId
  const isActive = status === 'active'
  const isCancelled = status === 'cancelled'
  const isTrialing = status === 'trialing'
  const isPastDue = status === 'past_due'
  const isSuspended = status === 'suspended'

  return (
    <div className="relative">
      {message && (
        <div className={`absolute bottom-full right-0 mb-2 z-50 whitespace-nowrap text-xs px-3 py-1.5 rounded-lg shadow-lg ${
          message.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {message.text}
        </div>
      )}

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="absolute bottom-full right-0 mb-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-3 min-w-[240px]">
          <p className="text-sm font-medium text-gray-900 mb-1">
            {showConfirm === 'cancel' && 'Cancel at period end?'}
            {showConfirm === 'cancel_immediately' && 'Cancel immediately?'}
            {showConfirm === 'pause' && 'Pause subscription?'}
          </p>
          <p className="text-xs text-gray-500 mb-3">
            {showConfirm === 'cancel' && `${userName} will keep access until billing period ends.`}
            {showConfirm === 'cancel_immediately' && `${userName} will lose access immediately.`}
            {showConfirm === 'pause' && `${userName} will keep access but won't be charged.`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => doAction(showConfirm)}
              disabled={loading}
              className="text-xs bg-red-600 text-white px-3 py-1 rounded font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Confirm'}
            </button>
            <button
              onClick={() => setShowConfirm(null)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Change Plan Dialog */}
      {showChangePlan && (
        <div className="absolute bottom-full right-0 mb-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 min-w-[280px]">
          <p className="text-sm font-semibold text-gray-900 mb-2">Change Plan</p>
          <p className="text-xs text-gray-500 mb-3">Prorated charges will be applied automatically.</p>
          <div className="space-y-1 max-h-[200px] overflow-y-auto">
            {plans
              .filter((p) => p.stripe_price_id && p.id !== currentLevelId)
              .map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setShowChangePlan(false)
                    doAction('change_plan', { newPriceId: p.stripe_price_id })
                  }}
                  disabled={loading}
                  className="w-full text-left text-sm px-3 py-2 rounded hover:bg-gray-50 border border-gray-100 disabled:opacity-50"
                >
                  <span className="font-medium">{p.name}</span>
                  <span className="text-gray-500 ml-2">
                    ${parseFloat(p.billing_amount).toFixed(2)}/{p.cycle_period?.toLowerCase() ?? 'mo'}
                  </span>
                </button>
              ))}
          </div>
          <button
            onClick={() => setShowChangePlan(false)}
            className="mt-2 text-xs text-gray-500 hover:text-gray-700"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Refund Dialog */}
      {showRefund && (
        <div className="absolute bottom-full right-0 mb-2 z-50 bg-white border border-gray-200 rounded-lg shadow-xl p-4 min-w-[260px]">
          <p className="text-sm font-semibold text-gray-900 mb-2">Refund Last Payment</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const fd = new FormData(e.currentTarget)
              const amount = fd.get('amount') as string
              const reason = fd.get('reason') as string
              setShowRefund(false)
              doAction('refund', {
                refundAmount: amount ? parseFloat(amount) : undefined,
                reason: reason || 'requested_by_customer',
              })
            }}
          >
            <label className="block text-xs text-gray-600 mb-1">Amount (leave blank for full refund)</label>
            <input name="amount" type="number" step="0.01" min="0" placeholder="Full refund" className="form-input text-sm w-full mb-2" />
            <label className="block text-xs text-gray-600 mb-1">Reason</label>
            <select name="reason" className="form-input text-sm w-full mb-3">
              <option value="requested_by_customer">Requested by customer</option>
              <option value="duplicate">Duplicate charge</option>
              <option value="fraudulent">Fraudulent</option>
            </select>
            <div className="flex gap-2">
              <button type="submit" disabled={loading} className="text-xs bg-amber-600 text-white px-3 py-1 rounded font-medium hover:bg-amber-700 disabled:opacity-50">
                {loading ? 'Processing...' : 'Process Refund'}
              </button>
              <button type="button" onClick={() => setShowRefund(false)} className="text-xs text-gray-500 hover:text-gray-700">
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Action Button */}
      <div className="flex items-center gap-1">
        {/* Quick action based on status */}
        {hasStripe && isActive && (
          <button
            onClick={() => setShowConfirm('cancel')}
            className="text-xs text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded hover:bg-red-50"
          >
            Cancel
          </button>
        )}
        {hasStripe && isCancelled && (
          <button
            onClick={() => doAction('reactivate')}
            disabled={loading}
            className="text-xs text-green-600 hover:text-green-800 font-medium px-2 py-1 rounded hover:bg-green-50 disabled:opacity-50"
          >
            {loading ? '...' : 'Reactivate'}
          </button>
        )}
        {hasStripe && isSuspended && (
          <button
            onClick={() => doAction('resume')}
            disabled={loading}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 disabled:opacity-50"
          >
            {loading ? '...' : 'Resume'}
          </button>
        )}

        {/* More actions dropdown */}
        {hasStripe && (
          <div className="relative">
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="text-xs text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
              title="More actions"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>

            {showMenu && (
              <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px]">
                {(isActive || isTrialing) && (
                  <>
                    <button onClick={() => { setShowMenu(false); setShowChangePlan(true) }} className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50 text-gray-700">
                      Change Plan
                    </button>
                    <button onClick={() => { setShowMenu(false); setShowConfirm('pause') }} className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50 text-gray-700">
                      Pause Subscription
                    </button>
                    <button onClick={() => { setShowMenu(false); setShowRefund(true) }} className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50 text-amber-600">
                      Refund Last Payment
                    </button>
                    <hr className="my-1" />
                    <button onClick={() => { setShowMenu(false); setShowConfirm('cancel_immediately') }} className="w-full text-left text-sm px-3 py-2 hover:bg-red-50 text-red-600">
                      Cancel Immediately
                    </button>
                  </>
                )}
                {isCancelled && (
                  <>
                    <button onClick={() => { setShowMenu(false); doAction('reactivate') }} className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50 text-green-600">
                      Reactivate
                    </button>
                    <button onClick={() => { setShowMenu(false); setShowRefund(true) }} className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50 text-amber-600">
                      Refund Last Payment
                    </button>
                  </>
                )}
                {isPastDue && (
                  <>
                    <button onClick={() => { setShowMenu(false); setShowConfirm('cancel') }} className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50 text-red-600">
                      Cancel at Period End
                    </button>
                    <button onClick={() => { setShowMenu(false); setShowConfirm('cancel_immediately') }} className="w-full text-left text-sm px-3 py-2 hover:bg-red-50 text-red-600">
                      Cancel Immediately
                    </button>
                  </>
                )}
                {isSuspended && (
                  <>
                    <button onClick={() => { setShowMenu(false); doAction('resume') }} className="w-full text-left text-sm px-3 py-2 hover:bg-gray-50 text-green-600">
                      Resume
                    </button>
                    <button onClick={() => { setShowMenu(false); setShowConfirm('cancel_immediately') }} className="w-full text-left text-sm px-3 py-2 hover:bg-red-50 text-red-600">
                      Cancel Immediately
                    </button>
                  </>
                )}
                <hr className="my-1" />
                <a
                  href={`https://dashboard.stripe.com/subscriptions/${subscriptionId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-sm px-3 py-2 hover:bg-gray-50 text-gray-500"
                >
                  View in Stripe &rarr;
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Click outside to close menus */}
      {(showMenu || showChangePlan || showRefund) && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => { setShowMenu(false); setShowChangePlan(false); setShowRefund(false) }}
        />
      )}
    </div>
  )
}
