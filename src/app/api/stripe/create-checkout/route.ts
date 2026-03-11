import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const LEVEL_PRICE_MAP: Record<string, string | undefined> = {
  '1': process.env.STRIPE_PRICE_ANNUAL_PRO,
  '2': process.env.STRIPE_PRICE_6MONTH,
  '3': process.env.STRIPE_PRICE_MONTHLY,
  '4': process.env.STRIPE_PRICE_1MONTH_TRIAL,
  '5': process.env.STRIPE_PRICE_50PCT_ANNUAL,
  '6': process.env.STRIPE_PRICE_14DAY_TRIAL,
  '7': process.env.STRIPE_PRICE_14DAY_TRIAL_ALT,
}

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { levelId } = body

  if (!levelId || !LEVEL_PRICE_MAP[String(levelId)]) {
    return NextResponse.json({ error: 'Invalid level' }, { status: 400 })
  }

  const priceId = LEVEL_PRICE_MAP[String(levelId)]!

  // Lazy import stripe to avoid build errors if not configured
  const stripeKey = process.env.STRIPE_SECRET_KEY
  if (!stripeKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(stripeKey, { apiVersion: '2024-06-20' as any })

  // Fetch or create Stripe customer
  const { data: profile } = await supabase
    .from('user_profiles')
    .select('stripe_customer_id, first_name, last_name')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || undefined,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    await supabase
      .from('user_profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://productionlist.com'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/membership-account/membership-confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/membership-account/membership-levels`,
    metadata: {
      supabase_user_id: user.id,
      level_id: String(levelId),
    },
    subscription_data: {
      metadata: {
        supabase_user_id: user.id,
        level_id: String(levelId),
      },
    },
  })

  return NextResponse.json({ url: session.url })
}
