/**
 * POST /api/admin/manage-subscription
 *
 * Admin endpoint to manage subscriptions via Stripe.
 * Actions: cancel, cancel_immediately, reactivate, change_plan, refund
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'

export async function POST(req: NextRequest) {
  const supabase = createAdminClient()
  const body = await req.json()
  const { action, membershipId, subscriptionId, newPriceId, refundAmount, reason } = body

  if (!action) {
    return NextResponse.json({ error: 'Missing action' }, { status: 400 })
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
