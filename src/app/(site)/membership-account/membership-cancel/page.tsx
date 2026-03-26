'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

interface MembershipInfo {
  planName: string
  endDate: string | null
  billingAmount: number
  cyclePeriod: string
}

export default function CancelMembershipPage() {
  const [confirmed, setConfirmed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [periodEnd, setPeriodEnd] = useState<string | null>(null)
  const [membership, setMembership] = useState<MembershipInfo | null>(null)
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadMembership() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data } = await supabase
          .from('user_memberships')
          .select('enddate, membership_levels(name, billing_amount, cycle_period)')
          .eq('user_id', user.id)
          .eq('status', 'active')
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (data) {
          const level = (data as any).membership_levels
          setMembership({
            planName: level?.name ?? 'Membership',
            endDate: data.enddate,
            billingAmount: level?.billing_amount ?? 0,
            cyclePeriod: level?.cycle_period ?? 'Month',
          })
        }
      } catch {
        // Silently handle — will show generic info
      } finally {
        setLoadingInfo(false)
      }
    }
    loadMembership()
  }, [])

  async function handleCancel() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/stripe/cancel-subscription', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data.success) {
        setPeriodEnd(data.periodEnd ?? null)
        setDone(true)
      } else {
        setError(data.error ?? 'Something went wrong. Please try again or contact support.')
      }
    } catch {
      setError('Something went wrong. Please try again or contact support.')
    }
    setLoading(false)
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  // Success state
  if (done) {
    return (
      <div className="page-wrap py-16 max-w-lg mx-auto">
        <div className="white-bg p-8 rounded-xl">
          {/* Success icon */}
          <div className="text-center mb-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-900 mb-2">Cancellation Confirmed</h1>
          </div>

          {/* What happens next */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-5 mb-6">
            <h2 className="text-sm font-semibold text-blue-900 mb-3">What happens next:</h2>
            <ul className="space-y-3 text-sm text-blue-800">
              <li className="flex items-start gap-2.5">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>
                  <strong>Your access continues</strong> until{' '}
                  {periodEnd ? (
                    <strong>{formatDate(periodEnd)}</strong>
                  ) : (
                    'the end of your current billing period'
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span><strong>No further charges</strong> will be made to your payment method</span>
              </li>
              <li className="flex items-start gap-2.5">
                <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span><strong>Your account stays active.</strong> You can log in anytime and rejoin whenever you&apos;re ready</span>
              </li>
            </ul>
          </div>

          <div className="flex flex-col gap-3">
            <Link href="/membership-account" className="btn-primary text-center">
              Back to My Account
            </Link>
            <Link href="/productions" className="btn-outline text-center text-sm">
              Continue Browsing Productions
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (loadingInfo) {
    return (
      <div className="page-wrap py-16 max-w-lg mx-auto">
        <div className="white-bg p-8 rounded-xl text-center">
          <div className="animate-pulse space-y-4">
            <div className="h-6 bg-gray-200 rounded w-2/3 mx-auto" />
            <div className="h-4 bg-gray-200 rounded w-full" />
            <div className="h-4 bg-gray-200 rounded w-3/4 mx-auto" />
          </div>
        </div>
      </div>
    )
  }

  // Cancel confirmation
  return (
    <div className="page-wrap py-16 max-w-lg mx-auto">
      <div className="white-bg p-8 rounded-xl">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-7 h-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Cancel Your Membership</h1>
          <p className="text-gray-500 text-sm">We&apos;re sorry to see you go</p>
        </div>

        {/* Current plan info */}
        {membership && (
          <div className="bg-gray-50 rounded-lg p-4 mb-6 border border-gray-100">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900">{membership.planName}</p>
                <p className="text-xs text-gray-500">
                  ${membership.billingAmount.toFixed(2)} / {membership.cyclePeriod.toLowerCase()}
                </p>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                Active
              </span>
            </div>
          </div>
        )}

        {/* What happens when you cancel */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Here&apos;s what will happen:</h2>
          <ul className="space-y-3">
            <li className="flex items-start gap-3 text-sm">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-gray-700">
                <strong>You keep full access</strong> to all production data until the end of your current billing period
                {membership?.endDate && (
                  <> — <strong>{formatDate(membership.endDate)}</strong></>
                )}
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-gray-700">
                <strong>No more charges.</strong> We won&apos;t bill you again after cancellation
              </span>
            </li>
            <li className="flex items-start gap-3 text-sm">
              <span className="flex-shrink-0 w-6 h-6 bg-green-100 rounded-full flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-gray-700">
                <strong>Your account remains.</strong> You can always log in and resubscribe when you&apos;re ready
              </span>
            </li>
          </ul>
        </div>

        {/* Confirmation checkbox */}
        <div className="bg-red-50 border border-red-100 rounded-lg p-4 mb-6">
          <label className="flex items-start gap-3 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
              className="rounded border-gray-300 text-red-600 focus:ring-red-500 mt-0.5"
            />
            <span className="text-gray-700">
              I understand that after my current billing period ends, I will no longer have access to production contacts, crew details, and weekly reports
            </span>
          </label>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={handleCancel}
            disabled={!confirmed || loading}
            className="w-full bg-red-600 text-white px-4 py-3 rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Processing cancellation…' : 'Confirm Cancellation'}
          </button>
          <Link
            href="/membership-account"
            className="w-full text-center py-3 rounded-lg text-sm font-semibold text-primary bg-primary/5 hover:bg-primary/10 transition-colors block"
          >
            Never Mind — Keep My Membership
          </Link>
        </div>

        {/* Support note */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Having issues? <Link href="/contact" className="text-primary hover:underline">Contact our support team</Link> — we&apos;re happy to help.
        </p>
      </div>
    </div>
  )
}
