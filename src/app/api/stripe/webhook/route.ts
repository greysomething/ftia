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

      // Upsert membership
      await supabase.from('user_memberships').upsert({
        user_id: userId,
        level_id: parseInt(levelId, 10),
        status: 'active',
        stripe_subscription_id: subscriptionId as string ?? null,
        enddate: periodEnd,
        startdate: new Date().toISOString(),
      }, { onConflict: 'user_id' })

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

    default:
      break
  }

  return NextResponse.json({ received: true })
}
