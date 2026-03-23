import type { Metadata } from 'next'
import Link from 'next/link'
import { getAdminMembershipPlans } from '@/lib/admin-queries'

export const metadata: Metadata = { title: 'Membership Plans' }

export default async function AdminMembershipPlansPage() {
  const plans = await getAdminMembershipPlans()

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Membership Plans</h1>
          <p className="text-sm text-gray-500 mt-1">Manage subscription plans and Stripe pricing</p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan: any) => (
          <div
            key={plan.id}
            className={`admin-card relative ${!plan.is_active ? 'opacity-60' : ''}`}
          >
            {/* Status indicator */}
            <div className="flex items-center justify-between mb-3">
              <span className={`badge ${plan.is_active ? 'badge-green' : 'badge-gray'}`}>
                {plan.is_active ? 'Active' : 'Inactive'}
              </span>
              {plan.allow_signups ? (
                <span className="text-xs text-green-600 font-medium">Signups open</span>
              ) : (
                <span className="text-xs text-gray-400">Signups closed</span>
              )}
            </div>

            <h3 className="text-lg font-bold text-gray-900 mb-1">{plan.name}</h3>

            {plan.description && (
              <p className="text-sm text-gray-500 mb-3 line-clamp-2">{plan.description}</p>
            )}

            {/* Pricing details */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Initial Payment</span>
                <span className="font-medium">${(plan.initial_payment ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Billing Amount</span>
                <span className="font-medium">${(plan.billing_amount ?? 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Cycle</span>
                <span className="font-medium">
                  {plan.cycle_number} {plan.cycle_period}{plan.cycle_number > 1 ? 's' : ''}
                </span>
              </div>
              {plan.trial_amount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Trial</span>
                  <span className="font-medium">${plan.trial_amount.toFixed(2)}</span>
                </div>
              )}
            </div>

            {/* Stripe info */}
            <div className="border-t pt-3 mt-3">
              <div className="flex items-center gap-2 mb-2">
                <svg className="w-4 h-4 text-[#635BFF]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.18l-.897 5.555C5.014 22.77 7.718 24 11.51 24c2.624 0 4.862-.649 6.334-1.838 1.588-1.28 2.397-3.178 2.397-5.637 0-4.145-2.543-5.827-6.266-7.376z"/>
                </svg>
                <span className="text-xs text-gray-500 font-mono truncate">
                  {plan.stripe_price_id || 'No Stripe Price ID'}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <Link
                href={`/admin/membership-plans/${plan.id}/edit`}
                className="btn-outline text-xs py-1.5 px-3 w-full text-center block"
              >
                Edit Plan
              </Link>
            </div>
          </div>
        ))}
      </div>

      {plans.length === 0 && (
        <div className="admin-card text-center py-12">
          <p className="text-gray-400">No membership plans configured yet.</p>
        </div>
      )}
    </div>
  )
}
