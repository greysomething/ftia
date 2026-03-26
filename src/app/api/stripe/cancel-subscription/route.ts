import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { secretKey } = await getActiveStripeKeys()
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  // Get active membership with Stripe subscription ID
  const { data: membership } = await supabase
    .from('user_memberships')
    .select('stripe_subscription_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .single()

  if (!membership?.stripe_subscription_id) {
    return NextResponse.json({ error: 'No active subscription found' }, { status: 404 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })

  // Cancel at period end (user retains access until billing period ends)
  const subscription = await stripe.subscriptions.update(membership.stripe_subscription_id, {
    cancel_at_period_end: true,
  })

  const periodEnd = new Date(subscription.current_period_end * 1000).toISOString()

  // Update local membership status and set end date
  await supabase
    .from('user_memberships')
    .update({ status: 'cancelled', enddate: periodEnd })
    .eq('user_id', user.id)
    .eq('stripe_subscription_id', membership.stripe_subscription_id)

  return NextResponse.json({ success: true, periodEnd })
}
