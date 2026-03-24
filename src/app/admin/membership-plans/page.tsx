import type { Metadata } from 'next'
import Link from 'next/link'
import { createAdminClient } from '@/lib/supabase/server'
import { PlanToggle } from './PlanToggle'
import { SyncButton } from './SyncButton'

export const metadata: Metadata = { title: 'Membership Plans' }
export const dynamic = 'force-dynamic'

export default async function AdminMembershipPlansPage() {
  const supabase = createAdminClient()

  // Fetch plans
  const { data: plans } = await supabase
    .from('membership_levels')
    .select('*')
    .order('id', { ascending: true })

  // Fetch subscriber counts per level
  const { data: memberships } = await supabase
    .from('user_memberships')
    .select('level_id, status')

  const subscriberCounts: Record<number, { active: number; total: number }> = {}
  for (const m of memberships ?? []) {
    if (!subscriberCounts[m.level_id]) subscriberCounts[m.level_id] = { active: 0, total: 0 }
    subscriberCounts[m.level_id].total++
    if (m.status === 'active') subscriberCounts[m.level_id].active++
  }

  const totalActive = (memberships ?? []).filter(m => m.status === 'active').length
  const totalMembers = (memberships ?? []).length

  // Group plans
  const activePlans = (plans ?? []).filter((p: any) => p.is_active)
  const inactivePlans = (plans ?? []).filter((p: any) => !p.is_active)

  function formatCycle(plan: any) {
    if (!plan.cycle_number || plan.cycle_number === 0) return 'One-time'
    const period = plan.cycle_period ?? 'Month'
    if (plan.cycle_number === 1) return `per ${period.toLowerCase()}`
    return `every ${plan.cycle_number} ${period.toLowerCase()}s`
  }

  function formatPrice(plan: any) {
    const amount = parseFloat(plan.billing_amount ?? 0)
    if (amount === 0) return 'Free'
    return `$${amount.toFixed(2)}`
  }

  function PlanCard({ plan }: { plan: any }) {
    const counts = subscriberCounts[plan.id] ?? { active: 0, total: 0 }
    const hasStripe = plan.stripe_price_id && plan.stripe_price_id.startsWith('price_')
    const showOnPricing = plan.allow_signups !== false

    return (
      <div className={`relative border rounded-xl transition-all ${
        !plan.is_active ? 'border-gray-200 bg-gray-50 opacity-70' : 'border-gray-200 bg-white shadow-sm hover:shadow-md'
      }`}>
        {/* Top status bar */}
        <div className={`px-5 py-2.5 rounded-t-xl border-b flex items-center justify-between ${
          !plan.is_active ? 'bg-gray-100 border-gray-200' :
          showOnPricing ? 'bg-green-50 border-green-100' : 'bg-yellow-50 border-yellow-100'
        }`}>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
              !plan.is_active ? 'bg-gray-200 text-gray-500' :
              showOnPricing ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                !plan.is_active ? 'bg-gray-400' : showOnPricing ? 'bg-green-500' : 'bg-yellow-500'
              }`} />
              {!plan.is_active ? 'Inactive' : showOnPricing ? 'Public' : 'Hidden'}
            </span>
            {plan.is_active && (
              <span className="text-[10px] text-gray-400 uppercase tracking-wider">
                {showOnPricing ? 'Visible on pricing page' : 'Active but not listed'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <PlanToggle planId={plan.id} field="is_active" checked={plan.is_active} label="Active" />
            {plan.is_active && (
              <PlanToggle planId={plan.id} field="allow_signups" checked={plan.allow_signups} label="Public" />
            )}
          </div>
        </div>

        <div className="p-5">
          {/* Plan name and price */}
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              {plan.description && (
                <p className="text-sm text-gray-500 mt-0.5 line-clamp-2">{plan.description}</p>
              )}
            </div>
            <div className="text-right flex-shrink-0 ml-4">
              <div className="text-2xl font-bold text-gray-900">{formatPrice(plan)}</div>
              <div className="text-xs text-gray-400">{formatCycle(plan)}</div>
            </div>
          </div>

          {/* Pricing details grid */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Initial</div>
              <div className="text-sm font-semibold text-gray-700">${parseFloat(plan.initial_payment ?? 0).toFixed(2)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Recurring</div>
              <div className="text-sm font-semibold text-gray-700">${parseFloat(plan.billing_amount ?? 0).toFixed(2)}</div>
            </div>
            <div className="bg-gray-50 rounded-lg px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-gray-400 mb-0.5">Cycle</div>
              <div className="text-sm font-semibold text-gray-700">
                {plan.cycle_number} {plan.cycle_period}
              </div>
            </div>
          </div>

          {plan.trial_amount > 0 && (
            <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4 text-xs text-blue-700">
              Trial: ${parseFloat(plan.trial_amount).toFixed(2)} for first {plan.trial_limit} cycle{plan.trial_limit > 1 ? 's' : ''}
            </div>
          )}

          {/* Subscribers */}
          <div className="flex items-center gap-4 mb-4 py-3 border-t border-b border-gray-100">
            <div className="flex items-center gap-1.5">
              <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="text-sm font-semibold text-gray-700">{counts.active}</span>
              <span className="text-xs text-gray-400">active</span>
            </div>
            {counts.total > counts.active && (
              <div className="text-xs text-gray-400">
                {counts.total} total ({counts.total - counts.active} cancelled/expired)
              </div>
            )}
            {counts.total === 0 && (
              <span className="text-xs text-gray-400">No subscribers yet</span>
            )}
          </div>

          {/* Stripe integration */}
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-4 h-4 text-[#635BFF] flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-7.076-2.18l-.897 5.555C5.014 22.77 7.718 24 11.51 24c2.624 0 4.862-.649 6.334-1.838 1.588-1.28 2.397-3.178 2.397-5.637 0-4.145-2.543-5.827-6.266-7.376z"/>
            </svg>
            {hasStripe ? (
              <span className="text-xs font-mono text-gray-500 truncate">{plan.stripe_price_id}</span>
            ) : (
              <span className="text-xs text-red-500 font-medium">No Stripe Price ID linked</span>
            )}
          </div>

          {/* Actions */}
          <Link
            href={`/admin/membership-plans/${plan.id}/edit`}
            className="btn-outline text-sm py-2 w-full text-center block"
          >
            Edit Plan
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Membership Plans</h1>
          <p className="text-sm text-gray-500 mt-1">
            {activePlans.length} active plan{activePlans.length !== 1 ? 's' : ''} &middot;{' '}
            {totalActive} active subscriber{totalActive !== 1 ? 's' : ''} &middot;{' '}
            {totalMembers} total
          </p>
        </div>
        <div className="flex items-center gap-3">
          <SyncButton />
          <Link href="/admin/membership-plans/new" className="btn-primary">
            + New Plan
          </Link>
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="admin-card py-3 px-4">
          <div className="text-2xl font-bold text-gray-900">{activePlans.length}</div>
          <div className="text-xs text-gray-500">Active Plans</div>
        </div>
        <div className="admin-card py-3 px-4">
          <div className="text-2xl font-bold text-green-600">{totalActive}</div>
          <div className="text-xs text-gray-500">Active Subscribers</div>
        </div>
        <div className="admin-card py-3 px-4">
          <div className="text-2xl font-bold text-gray-900">{totalMembers}</div>
          <div className="text-xs text-gray-500">Total Members</div>
        </div>
        <div className="admin-card py-3 px-4">
          <div className="text-2xl font-bold text-gray-900">
            {(plans ?? []).filter((p: any) => p.stripe_price_id?.startsWith('price_')).length}
          </div>
          <div className="text-xs text-gray-500">Stripe-Connected</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mb-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-500" /> Public — shown on pricing page
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-500" /> Hidden — active but not listed publicly
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-400" /> Inactive — disabled
        </span>
      </div>

      {/* Active Plans */}
      {activePlans.length > 0 && (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3 mb-8">
          {activePlans.map((plan: any) => (
            <PlanCard key={plan.id} plan={plan} />
          ))}
        </div>
      )}

      {/* Inactive Plans */}
      {inactivePlans.length > 0 && (
        <>
          <div className="flex items-center gap-3 mb-4 mt-8">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">Inactive Plans</h2>
            <div className="flex-1 border-t border-gray-200" />
          </div>
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
            {inactivePlans.map((plan: any) => (
              <PlanCard key={plan.id} plan={plan} />
            ))}
          </div>
        </>
      )}

      {(plans ?? []).length === 0 && (
        <div className="admin-card text-center py-12">
          <p className="text-gray-400">No membership plans configured yet.</p>
          <Link href="/admin/membership-plans/new" className="btn-primary mt-4 inline-block">Create Your First Plan</Link>
        </div>
      )}
    </div>
  )
}
