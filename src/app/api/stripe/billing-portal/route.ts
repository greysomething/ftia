import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getUser } from '@/lib/auth'
import { getActiveStripeKeys } from '@/lib/stripe-settings'

export async function POST(req: NextRequest) {
  const user = await getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { secretKey } = await getActiveStripeKeys()
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  // Get Stripe customer ID from membership (use admin client to bypass RLS during impersonation)
  const supabase = createAdminClient()
  const { data: membership } = await supabase
    .from('user_memberships')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .not('stripe_customer_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (!membership?.stripe_customer_id) {
    return NextResponse.json({ error: 'No Stripe customer found' }, { status: 404 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })

  const { return_url } = await req.json()

  const session = await stripe.billingPortal.sessions.create({
    customer: membership.stripe_customer_id,
    return_url: return_url || `${req.nextUrl.origin}/membership-account/membership-billing`,
  })

  return NextResponse.json({ url: session.url })
}
