'use client'

import { useActionState } from 'react'
import { saveMembershipPlan } from '@/app/admin/membership-plans/actions'

interface MembershipPlanFormProps {
  plan?: any
}

export function MembershipPlanForm({ plan }: MembershipPlanFormProps) {
  const [state, formAction, isPending] = useActionState(saveMembershipPlan, null)

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {state?.error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm">
          {state.error}
        </div>
      )}

      {plan?.id && <input type="hidden" name="id" value={plan.id} />}

      <div className="admin-card space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Plan Details</h2>

        <div>
          <label className="form-label">Plan Name *</label>
          <input name="name" defaultValue={plan?.name ?? ''} required className="form-input w-full" />
        </div>

        <div>
          <label className="form-label">Description</label>
          <textarea name="description" defaultValue={plan?.description ?? ''} rows={3} className="form-input w-full" />
        </div>

        <div>
          <label className="form-label">Confirmation Message</label>
          <textarea name="confirmation" defaultValue={plan?.confirmation ?? ''} rows={3} className="form-input w-full"
            placeholder="Message shown after successful signup" />
        </div>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Pricing</h2>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Initial Payment ($)</label>
            <input name="initial_payment" type="number" step="0.01" min="0"
              defaultValue={plan?.initial_payment ?? 0} className="form-input w-full" />
          </div>
          <div>
            <label className="form-label">Billing Amount ($)</label>
            <input name="billing_amount" type="number" step="0.01" min="0"
              defaultValue={plan?.billing_amount ?? 0} className="form-input w-full" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="form-label">Cycle Number</label>
            <input name="cycle_number" type="number" min="1"
              defaultValue={plan?.cycle_number ?? 1} className="form-input w-full" />
          </div>
          <div>
            <label className="form-label">Cycle Period</label>
            <select name="cycle_period" defaultValue={plan?.cycle_period ?? 'Month'} className="form-input w-full">
              <option value="Day">Day</option>
              <option value="Week">Week</option>
              <option value="Month">Month</option>
              <option value="Year">Year</option>
            </select>
          </div>
          <div>
            <label className="form-label">Billing Limit</label>
            <input name="billing_limit" type="number" min="0"
              defaultValue={plan?.billing_limit ?? 0} className="form-input w-full"
              placeholder="0 = unlimited" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="form-label">Trial Amount ($)</label>
            <input name="trial_amount" type="number" step="0.01" min="0"
              defaultValue={plan?.trial_amount ?? 0} className="form-input w-full" />
          </div>
          <div>
            <label className="form-label">Trial Limit</label>
            <input name="trial_limit" type="number" min="0"
              defaultValue={plan?.trial_limit ?? 0} className="form-input w-full" />
          </div>
        </div>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Stripe Integration</h2>

        <div>
          <label className="form-label">Stripe Price ID</label>
          <input name="stripe_price_id" defaultValue={plan?.stripe_price_id ?? ''} className="form-input w-full font-mono text-sm"
            placeholder="price_..." />
          <p className="text-xs text-gray-400 mt-1">The Stripe Price ID to use for checkout sessions</p>
        </div>
      </div>

      <div className="admin-card space-y-4">
        <h2 className="text-base font-semibold text-gray-900">Settings</h2>

        <div className="flex gap-6">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_active" defaultChecked={plan?.is_active ?? true}
              className="rounded border-gray-300" />
            <span>Active</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="allow_signups" defaultChecked={plan?.allow_signups ?? true}
              className="rounded border-gray-300" />
            <span>Allow Signups</span>
          </label>
        </div>
      </div>

      <div className="flex gap-3">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? 'Saving…' : plan ? 'Update Plan' : 'Create Plan'}
        </button>
        <a href="/admin/membership-plans" className="btn-outline">Cancel</a>
      </div>
    </form>
  )
}
