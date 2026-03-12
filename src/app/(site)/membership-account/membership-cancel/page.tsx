'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function CancelMembershipPage() {
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const router = useRouter()

  async function handleCancel() {
    setLoading(true)
    const res = await fetch('/api/stripe/cancel-subscription', { method: 'POST' })
    if (res.ok) {
      setDone(true)
    }
    setLoading(false)
  }

  if (done) {
    return (
      <div className="page-wrap py-16 text-center max-w-md mx-auto">
        <div className="white-bg p-8">
          <h1 className="text-xl font-bold text-primary mb-3">Membership Cancelled</h1>
          <p className="text-gray-600 mb-6">Your membership has been cancelled. You retain access until the end of your billing period.</p>
          <Link href="/membership-account" className="btn-primary">Back to Account</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page-wrap py-16 max-w-md mx-auto">
      <div className="white-bg p-8">
        <h1 className="text-2xl font-bold text-primary mb-3">Cancel Membership</h1>
        <p className="text-gray-600 mb-6">
          Are you sure you want to cancel? You&apos;ll lose access to the production database at the end of your current billing period.
        </p>

        <div className="mb-6">
          <label className="flex items-center gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded"
            />
            I understand I will lose access to the production database
          </label>
        </div>

        <div className="flex gap-3">
          <button
            onClick={handleCancel}
            disabled={!confirmed || loading}
            className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 disabled:opacity-50"
          >
            {loading ? 'Cancelling…' : 'Cancel Membership'}
          </button>
          <Link href="/membership-account" className="btn-outline text-sm">
            Keep Membership
          </Link>
        </div>
      </div>
    </div>
  )
}
