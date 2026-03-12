import type { Metadata } from 'next'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/utils'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Billing | Production List' }

export default async function BillingPage() {
  const user = await requireAuth()
  const supabase = await createClient()

  const { data: membership } = await supabase
    .from('user_memberships')
    .select('*, membership_levels(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  return (
    <div className="page-wrap py-8 max-w-2xl">
      <h1 className="text-2xl font-bold text-primary mb-6">Billing Information</h1>

      {membership ? (
        <div className="white-bg p-6 space-y-4">
          <div className="flex justify-between">
            <span className="text-gray-600">Plan:</span>
            <span className="font-medium">{(membership as any).membership_levels?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Status:</span>
            <span className={`font-medium ${membership.status === 'active' ? 'text-green-600' : 'text-red-600'}`}>
              {membership.status}
            </span>
          </div>
          {membership.startdate && (
            <div className="flex justify-between">
              <span className="text-gray-600">Started:</span>
              <span>{formatDate(membership.startdate)}</span>
            </div>
          )}
          {membership.enddate && (
            <div className="flex justify-between">
              <span className="text-gray-600">Next renewal:</span>
              <span>{formatDate(membership.enddate)}</span>
            </div>
          )}
          {membership.card_type && (
            <div className="flex justify-between">
              <span className="text-gray-600">Payment method:</span>
              <span>{membership.card_type} ending {membership.card_last4}</span>
            </div>
          )}
          <div className="pt-4 border-t flex gap-3">
            <Link href="/membership-account/membership-cancel" className="btn-outline text-sm text-red-600 border-red-200 hover:bg-red-50 hover:text-red-600">
              Cancel Membership
            </Link>
            <Link href="/membership-account/membership-levels" className="btn-outline text-sm">
              Change Plan
            </Link>
          </div>
        </div>
      ) : (
        <div className="white-bg p-6 text-center">
          <p className="text-gray-600 mb-4">No active membership found.</p>
          <Link href="/membership-account/membership-levels" className="btn-primary">
            View Plans
          </Link>
        </div>
      )}
    </div>
  )
}
