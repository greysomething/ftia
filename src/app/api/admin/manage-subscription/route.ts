/**
 * POST /api/admin/manage-subscription
 *
 * Admin endpoint to manage subscriptions via Stripe.
 * Actions: cancel, cancel_immediately, reactivate, change_plan, refund
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'
import { moveToPastMember, moveToActiveMember } from '@/lib/resend-audiences'

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const body = await req.json()
  const { action, membershipId, subscriptionId, newPriceId, refundAmount, reason } = body

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
  }

  // Helper: look up user email from membership for audience updates
  async function getEmailFromMembership(memId: string) {
    if (!memId) return null
    const { data } = await supabase
      .from('user_memberships')
      .select('user_id, user_profiles!inner(email, first_name, last_name)')
      .eq('id', memId)
      .single()
    const profile = (data as any)?.user_profiles
    return profile?.email ? { email: profile.email, firstName: profile.first_name, lastName: profile.last_name } : null
  }

  const { secretKey } = await getActiveStripeKeys()
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })

  try {
    switch (action) {
      case 'cancel': {
        // Cancel at period end — user keeps access until billing period ends
        if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })

        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        })

        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()

        if (membershipId) {
          await supabase
            .from('user_memberships')
            .update({ status: 'cancelled', enddate: periodEnd, modified: new Date().toISOString() })
            .eq('id', membershipId)
        }

        // Move to Past Members audience (fire-and-forget)
        if (membershipId) {
          const contact = await getEmailFromMembership(membershipId)
          if (contact) void moveToPastMember(contact.email, contact.firstName ?? undefined, contact.lastName ?? undefined)
        }

        return NextResponse.json({
          success: true,
          message: `Subscription will cancel at end of billing period (${new Date(periodEnd).toLocaleDateString()}).`,
        })
      }

      case 'cancel_immediately': {
        // Cancel immediately — access revoked now
        if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })

        await stripe.subscriptions.cancel(subscriptionId)

        if (membershipId) {
          await supabase
            .from('user_memberships')
            .update({ status: 'expired', enddate: new Date().toISOString(), modified: new Date().toISOString() })
            .eq('id', membershipId)
        }

        // Move to Past Members audience (fire-and-forget)
        if (membershipId) {
          const contact = await getEmailFromMembership(membershipId)
          if (contact) void moveToPastMember(contact.email, contact.firstName ?? undefined, contact.lastName ?? undefined)
        }

        return NextResponse.json({
          success: true,
          message: 'Subscription cancelled immediately. Access has been revoked.',
        })
      }

      case 'reactivate': {
        // Reactivate a subscription that was set to cancel at period end
        if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })

        const subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: false,
        })

        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()

        if (membershipId) {
          await supabase
            .from('user_memberships')
            .update({ status: 'active', enddate: periodEnd, modified: new Date().toISOString() })
            .eq('id', membershipId)
        }

        // Move back to Active Members audience (fire-and-forget)
        if (membershipId) {
          const contact = await getEmailFromMembership(membershipId)
          if (contact) void moveToActiveMember(contact.email, contact.firstName ?? undefined, contact.lastName ?? undefined)
        }

        return NextResponse.json({
          success: true,
          message: 'Subscription reactivated. Recurring billing will continue.',
        })
      }

      case 'change_plan': {
        // Change subscription to a different price
        if (!subscriptionId || !newPriceId) {
          return NextResponse.json({ error: 'Missing subscriptionId or newPriceId' }, { status: 400 })
        }

        const subscription = await stripe.subscriptions.retrieve(subscriptionId)
        const itemId = subscription.items.data[0]?.id
        if (!itemId) {
          return NextResponse.json({ error: 'No subscription item found' }, { status: 400 })
        }

        const updated = await stripe.subscriptions.update(subscriptionId, {
          items: [{ id: itemId, price: newPriceId }],
          proration_behavior: 'create_prorations',
        })

        // Find the new level_id from our DB
        const { data: level } = await supabase
          .from('membership_levels')
          .select('id, name')
          .eq('stripe_price_id', newPriceId)
          .single()

        if (membershipId && level) {
          await supabase
            .from('user_memberships')
            .update({
              level_id: level.id,
              enddate: new Date(updated.current_period_end * 1000).toISOString(),
              modified: new Date().toISOString(),
            })
            .eq('id', membershipId)
        }

        return NextResponse.json({
          success: true,
          message: `Plan changed to ${level?.name ?? newPriceId}. Prorated charges applied.`,
        })
      }

      case 'refund': {
        // Refund the latest payment
        if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })

        // Get latest invoice for this subscription
        const invoices = await stripe.invoices.list({
          subscription: subscriptionId,
          limit: 1,
          status: 'paid',
        })

        const latestInvoice = invoices.data[0]
        if (!latestInvoice?.payment_intent) {
          return NextResponse.json({ error: 'No paid invoice found to refund' }, { status: 400 })
        }

        const refundParams: any = {
          payment_intent: latestInvoice.payment_intent as string,
        }
        if (refundAmount) {
          refundParams.amount = Math.round(refundAmount * 100) // Convert dollars to cents
        }
        if (reason) {
          refundParams.reason = reason // 'duplicate', 'fraudulent', 'requested_by_customer'
        }

        const refund = await stripe.refunds.create(refundParams)

        return NextResponse.json({
          success: true,
          message: `Refund of $${(refund.amount / 100).toFixed(2)} processed successfully.`,
          refundId: refund.id,
        })
      }

      case 'pause': {
        // Pause collection — subscription stays active but no charges
        if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })

        await stripe.subscriptions.update(subscriptionId, {
          pause_collection: { behavior: 'void' },
        })

        if (membershipId) {
          await supabase
            .from('user_memberships')
            .update({ status: 'suspended', modified: new Date().toISOString() })
            .eq('id', membershipId)
        }

        return NextResponse.json({
          success: true,
          message: 'Subscription paused. No further charges will be made until resumed.',
        })
      }

      case 'resume': {
        // Resume a paused subscription
        if (!subscriptionId) return NextResponse.json({ error: 'Missing subscriptionId' }, { status: 400 })

        await stripe.subscriptions.update(subscriptionId, {
          pause_collection: '',
        } as any)

        if (membershipId) {
          await supabase
            .from('user_memberships')
            .update({ status: 'active', modified: new Date().toISOString() })
            .eq('id', membershipId)
        }

        return NextResponse.json({
          success: true,
          message: 'Subscription resumed. Billing will continue on the next cycle.',
        })
      }

      case 'cleanup_duplicate_orders': {
        // Remove duplicate orders: for each user+total+date combo,
        // keep the order WITH a payment_transaction_id and remove the one without.
        const { data: allOrders } = await supabase
          .from('membership_orders')
          .select('id, user_id, total, payment_transaction_id, timestamp, billing_reason')
          .eq('status', 'success')
          .order('timestamp', { ascending: false })

        if (!allOrders || allOrders.length === 0) {
          return NextResponse.json({ success: true, removed: 0, message: 'No orders to check.' })
        }

        // Group by user_id + total + date (same day)
        const groups = new Map<string, typeof allOrders>()
        for (const order of allOrders) {
          const date = order.timestamp ? order.timestamp.slice(0, 10) : 'unknown'
          const key = `${order.user_id}:${order.total}:${date}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(order)
        }

        const idsToRemove: number[] = []
        for (const [, group] of groups) {
          if (group.length <= 1) continue
          // Keep the one with payment_transaction_id, remove the others
          const withPi = group.filter((o: any) => o.payment_transaction_id)
          const withoutPi = group.filter((o: any) => !o.payment_transaction_id)
          if (withPi.length > 0 && withoutPi.length > 0) {
            idsToRemove.push(...withoutPi.map((o: any) => o.id))
          }
        }

        if (idsToRemove.length > 0) {
          await supabase.from('membership_orders').delete().in('id', idsToRemove)
        }

        return NextResponse.json({
          success: true,
          removed: idsToRemove.length,
          message: `Removed ${idsToRemove.length} duplicate order(s).`,
        })
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err: any) {
    console.error('[manage-subscription]', err)
    return NextResponse.json(
      { error: err.message ?? 'Stripe API error' },
      { status: 500 }
    )
  }
}
