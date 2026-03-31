import { NextRequest, NextResponse } from 'next/server'
import { createRawClient, createAdminClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'

export async function POST(req: NextRequest) {
  // Use raw client for auth (createClient may return admin client during impersonation)
  const supabase = await createRawClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { levelId } = body

  if (!levelId) {
    return NextResponse.json({ error: 'Level ID is required' }, { status: 400 })
  }

  // Look up the plan details from the membership_levels table
  const admin = createAdminClient()
  const { data: level, error: levelError } = await admin
    .from('membership_levels')
    .select('stripe_price_id, name, trial_limit, trial_amount')
    .eq('id', parseInt(String(levelId), 10))
    .eq('is_active', true)
    .single()

  if (levelError || !level?.stripe_price_id) {
    return NextResponse.json(
      { error: 'This plan is not available or has no Stripe price configured.' },
      { status: 400 }
    )
  }

  const priceId = level.stripe_price_id

  // Determine trial period from our database (not from Stripe Price defaults).
  // trial_limit = number of trial days (0 means no trial).
  // This explicitly overrides any trial_period_days set on the Stripe Price itself.
  const trialDays = level.trial_limit ?? 0

  // Get active Stripe keys (test or live based on admin setting)
  const { secretKey, mode } = await getActiveStripeKeys()
  if (!secretKey) {
    return NextResponse.json(
      { error: `Stripe ${mode} mode secret key is not configured. Update in Admin → Merchant Settings.` },
      { status: 500 }
    )
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })

  // Fetch or create Stripe customer
  const { data: profile } = await admin
    .from('user_profiles')
    .select('stripe_customer_id, first_name, last_name')
    .eq('id', user.id)
    .single()

  let customerId = profile?.stripe_customer_id

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') || undefined
  const description = fullName && user.email ? `${fullName} (${user.email})` : undefined

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: fullName,
      description,
      metadata: { supabase_user_id: user.id },
    })
    customerId = customer.id

    await admin
      .from('user_profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id)
  } else if (fullName) {
    // Update existing Stripe customer with current name/description
    await stripe.customers.update(customerId, {
      name: fullName,
      description,
    })
  }

  const origin = req.headers.get('origin') ?? process.env.NEXT_PUBLIC_SITE_URL ?? 'https://productionlist.com'

  // Build subscription_data — explicitly set trial_period_days to override
  // any trial configured on the Stripe Price itself. Without this, Stripe
  // applies the Price's default trial, causing paid plans to become free trials.
  const subscriptionData: any = {
    metadata: {
      supabase_user_id: user.id,
      level_id: String(levelId),
    },
  }

  if (trialDays > 0) {
    // This plan has a trial period configured in our database
    subscriptionData.trial_period_days = trialDays
    subscriptionData.trial_settings = {
      end_behavior: { missing_payment_method: 'cancel' },
    }
  } else {
    // No trial — explicitly set to 0 to override any trial on the Stripe Price.
    // Also use trial_settings to make absolutely sure no trial is applied.
    subscriptionData.trial_period_days = 0
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/membership-account/membership-confirmation?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/membership-plans`,
    metadata: {
      supabase_user_id: user.id,
      level_id: String(levelId),
    },
    subscription_data: subscriptionData,
  })

  return NextResponse.json({ url: session.url })
}
