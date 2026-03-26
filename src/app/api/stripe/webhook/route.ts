import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { secretKey, webhookSecret } = await getActiveStripeKeys()

  if (!secretKey || !webhookSecret) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })

  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig) {
    return NextResponse.json({ error: 'No signature' }, { status: 400 })
  }

  let event: any
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret)
  } catch (err: any) {
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 })
  }

  const supabase = createAdminClient()

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object
      const userId = session.metadata?.supabase_user_id
      const levelId = session.metadata?.level_id

      if (!userId || !levelId) break

      const subscriptionId = session.subscription
      let periodEnd: string | null = null

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId as string)
        periodEnd = new Date((sub as any).current_period_end * 1000).toISOString()
      }

      // Insert or update membership
      const { data: existingMem } = await supabase
        .from('user_memberships').select('id').eq('user_id', userId).single()

      const memRow = {
        user_id: userId,
        level_id: parseInt(levelId, 10),
        status: 'active' as const,
        stripe_subscription_id: subscriptionId as string ?? null,
        enddate: periodEnd,
        startdate: new Date().toISOString(),
      }

      if (existingMem) {
        await supabase.from('user_memberships').update(memRow).eq('id', existingMem.id)
      } else {
        await supabase.from('user_memberships').insert(memRow)
      }

      // Update Stripe customer with name & description from profile
      const stripeCustomerId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id
      if (stripeCustomerId) {
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, email')
          .eq('id', userId)
          .single()
        if (userProfile) {
          const name = [userProfile.first_name, userProfile.last_name].filter(Boolean).join(' ')
          const email = userProfile.email || session.customer_email
          if (name) {
            await stripe.customers.update(stripeCustomerId, {
              name,
              description: email ? `${name} (${email})` : name,
            })
          }
        }
      }

      // Record order
      await supabase.from('membership_orders').insert({
        user_id: userId,
        level_id: parseInt(levelId, 10),
        status: 'success',
        total: session.amount_total ? (session.amount_total / 100) : 0,
        gateway: 'stripe',
        payment_transaction_id: session.payment_intent as string ?? null,
        subscription_transaction_id: subscriptionId as string ?? null,
      })

      break
    }

    case 'invoice.payment_succeeded': {
      const invoice = event.data.object
      const subscriptionId = invoice.subscription
      if (!subscriptionId) break

      const sub = await stripe.subscriptions.retrieve(subscriptionId as string)
      const userId = (sub as any).metadata?.supabase_user_id
      const levelId = (sub as any).metadata?.level_id
      if (!userId) break

      const periodEnd = new Date((sub as any).current_period_end * 1000).toISOString()

      await supabase
        .from('user_memberships')
        .update({ status: 'active', enddate: periodEnd })
        .eq('user_id', userId)
        .eq('stripe_subscription_id', subscriptionId)

      if (levelId) {
        await supabase.from('membership_orders').insert({
          user_id: userId,
          level_id: parseInt(levelId, 10),
          status: 'success',
          total: invoice.amount_paid ? (invoice.amount_paid / 100) : 0,
          gateway: 'stripe',
          payment_transaction_id: invoice.payment_intent as string ?? null,
          subscription_transaction_id: subscriptionId as string ?? null,
        })
      }

      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object
      const userId = sub.metadata?.supabase_user_id
      if (!userId) break

      await supabase
        .from('user_memberships')
        .update({ status: 'expired' })
        .eq('user_id', userId)
        .eq('stripe_subscription_id', sub.id)

      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object
      const subscriptionId = invoice.subscription
      if (!subscriptionId) break

      const sub = await stripe.subscriptions.retrieve(subscriptionId as string)
      const userId = (sub as any).metadata?.supabase_user_id
      if (!userId) break

      await supabase
        .from('user_memberships')
        .update({ status: 'expired' })
        .eq('user_id', userId)
        .eq('stripe_subscription_id', subscriptionId)

      break
    }

    // ---- Dispute handling ----
    case 'charge.dispute.created': {
      const dispute = event.data.object
      const customerId = dispute.customer

      if (!customerId) break

      // Find membership(s) by stripe_customer_id and suspend
      const { data: memberships } = await supabase
        .from('user_memberships')
        .select('id, user_id, level_id, status')
        .eq('stripe_customer_id', customerId)
        .eq('status', 'active')

      if (!memberships?.length) break

      for (const mem of memberships) {
        await supabase
          .from('user_memberships')
          .update({
            status: 'suspended',
            modified: new Date().toISOString(),
          })
          .eq('id', mem.id)

        // Log dispute in membership_orders for audit trail
        await supabase.from('membership_orders').insert({
          user_id: mem.user_id,
          level_id: mem.level_id,
          status: 'dispute_opened',
          total: dispute.amount ? -(dispute.amount / 100) : 0,
          gateway: 'stripe',
          payment_transaction_id: dispute.payment_intent as string ?? null,
          notes: `Dispute opened: ${dispute.reason || 'No reason given'}. Dispute ID: ${dispute.id}. Account suspended pending resolution.`,
        })
      }

      console.log(`[Stripe Webhook] Dispute created (${dispute.id}) — suspended ${memberships.length} membership(s) for customer ${customerId}`)
      break
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object
      const customerId = dispute.customer

      if (!customerId) break

      // Find suspended membership(s) for this customer
      const { data: memberships } = await supabase
        .from('user_memberships')
        .select('id, user_id, level_id, status, enddate')
        .eq('stripe_customer_id', customerId)
        .eq('status', 'suspended')

      if (!memberships?.length) break

      const disputeWon = dispute.status === 'won'

      for (const mem of memberships) {
        if (disputeWon) {
          // Dispute won — reactivate membership
          await supabase
            .from('user_memberships')
            .update({
              status: 'active',
              modified: new Date().toISOString(),
            })
            .eq('id', mem.id)
        }
        // If lost, keep status as 'suspended' — admin must manually handle

        await supabase.from('membership_orders').insert({
          user_id: mem.user_id,
          level_id: mem.level_id,
          status: disputeWon ? 'dispute_won' : 'dispute_lost',
          total: dispute.amount ? (disputeWon ? 0 : -(dispute.amount / 100)) : 0,
          gateway: 'stripe',
          payment_transaction_id: dispute.payment_intent as string ?? null,
          notes: disputeWon
            ? `Dispute won (${dispute.id}). Membership reactivated.`
            : `Dispute lost (${dispute.id}). Membership remains suspended. Admin action required.`,
        })
      }

      console.log(`[Stripe Webhook] Dispute ${dispute.status} (${dispute.id}) for customer ${customerId}`)
      break
    }

    case 'charge.dispute.updated': {
      // Log dispute updates for visibility but don't change status
      const dispute = event.data.object
      console.log(`[Stripe Webhook] Dispute updated (${dispute.id}): status=${dispute.status}, reason=${dispute.reason}`)
      break
    }

    // ---- Refund handling ----
    case 'charge.refunded': {
      const charge = event.data.object
      const customerId = typeof charge.customer === 'string' ? charge.customer : (charge.customer as any)?.id
      if (!customerId) break

      // Find user by stripe_customer_id
      const { data: membershipForRefund } = await supabase
        .from('user_memberships')
        .select('id, user_id, level_id')
        .eq('stripe_customer_id', customerId)
        .limit(1)
        .single()

      if (!membershipForRefund) break

      // Calculate refund amount (total refunded - could be partial)
      const refundAmount = charge.amount_refunded ? (charge.amount_refunded / 100) : 0

      await supabase.from('membership_orders').insert({
        user_id: membershipForRefund.user_id,
        level_id: membershipForRefund.level_id,
        status: 'refunded',
        total: -refundAmount,
        gateway: 'stripe',
        payment_transaction_id: charge.payment_intent as string ?? null,
        notes: `Refund of $${refundAmount.toFixed(2)}${charge.refunds?.data?.[0]?.reason ? ` — Reason: ${charge.refunds.data[0].reason}` : ''}`,
      })

      console.log(`[Stripe Webhook] Charge refunded: $${refundAmount} for customer ${customerId}`)
      break
    }

    // ---- Subscription updates (plan changes, metadata) ----
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as any)?.id
      if (!customerId) break

      const { data: membershipForUpdate } = await supabase
        .from('user_memberships')
        .select('id, user_id')
        .eq('stripe_customer_id', customerId)
        .limit(1)
        .single()

      if (!membershipForUpdate) break

      // Map status — keep trialing and past_due as distinct statuses
      let updatedStatus: string
      switch (sub.status) {
        case 'active':
          updatedStatus = sub.cancel_at_period_end ? 'cancelled' : 'active'; break
        case 'trialing':
          updatedStatus = 'trialing'; break
        case 'past_due':
          updatedStatus = 'past_due'; break
        case 'canceled':
          updatedStatus = 'cancelled'; break
        default:
          updatedStatus = 'expired'; break
      }

      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null

      // Extract card details if payment method expanded
      const pm = sub.default_payment_method as any
      const cardUpdate = pm?.card ? {
        card_type: pm.card.brand ?? null,
        card_last4: pm.card.last4 ?? null,
        card_exp_month: String(pm.card.exp_month ?? ''),
        card_exp_year: String(pm.card.exp_year ?? ''),
      } : {}

      // Map price to level
      const updPriceId = sub.items?.data?.[0]?.price?.id
      let updLevelId: number | undefined
      if (updPriceId) {
        // Look up level by stripe_price_id
        const { data: matchedLevel } = await supabase
          .from('membership_levels')
          .select('id')
          .eq('stripe_price_id', updPriceId)
          .single()
        if (matchedLevel) updLevelId = matchedLevel.id
      }

      await supabase
        .from('user_memberships')
        .update({
          status: updatedStatus,
          enddate: periodEnd,
          stripe_subscription_id: sub.id,
          modified: new Date().toISOString(),
          ...cardUpdate,
          ...(updLevelId ? { level_id: updLevelId } : {}),
        })
        .eq('id', membershipForUpdate.id)

      console.log(`[Stripe Webhook] Subscription updated (${sub.id}): status=${sub.status} for customer ${customerId}`)
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}
