import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'

export const dynamic = 'force-dynamic'

/**
 * Sync Stripe products/prices → membership_levels.
 * For each active price in Stripe, matches by stripe_price_id or creates a new level.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { secretKey, mode } = await getActiveStripeKeys()
  if (!secretKey) {
    return NextResponse.json(
      { error: `Stripe ${mode} secret key is not configured.` },
      { status: 500 }
    )
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })
  const supabase = createAdminClient()

  try {
    // Fetch all active prices with product info
    const prices = await stripe.prices.list({
      active: true,
      expand: ['data.product'],
      limit: 100,
    })

    // Get existing levels from DB
    const { data: existingLevels } = await supabase
      .from('membership_levels')
      .select('id, name, stripe_price_id')

    const existingPriceIds = new Set(
      (existingLevels ?? []).map((l: any) => l.stripe_price_id).filter(Boolean)
    )

    let synced = 0
    let created = 0
    let skipped = 0
    const results: any[] = []

    for (const price of prices.data) {
      const product = price.product as any
      if (!product || typeof product === 'string') {
        skipped++
        continue
      }

      // Skip non-recurring prices (we only handle subscriptions)
      if (price.type !== 'recurring') {
        skipped++
        continue
      }

      const priceId = price.id
      const productName = product.name || 'Unnamed Product'

      // Map Stripe interval to our cycle_period
      const intervalMap: Record<string, string> = {
        day: 'Day',
        week: 'Week',
        month: 'Month',
        year: 'Year',
      }

      const cyclePeriod = intervalMap[price.recurring?.interval ?? 'month'] ?? 'Month'
      const cycleNumber = price.recurring?.interval_count ?? 1
      const amount = (price.unit_amount ?? 0) / 100

      if (existingPriceIds.has(priceId)) {
        // Update existing level
        const level = (existingLevels ?? []).find((l: any) => l.stripe_price_id === priceId)
        if (level) {
          await supabase.from('membership_levels').update({
            billing_amount: amount,
            initial_payment: amount,
            cycle_period: cyclePeriod,
            cycle_number: cycleNumber,
          }).eq('id', level.id)
          synced++
          results.push({ action: 'updated', name: level.name, priceId })
        }
      } else {
        // Create new level
        const { error } = await supabase.from('membership_levels').insert({
          name: productName,
          description: product.description || null,
          stripe_price_id: priceId,
          initial_payment: amount,
          billing_amount: amount,
          cycle_number: cycleNumber,
          cycle_period: cyclePeriod,
          billing_limit: 0,
          trial_amount: 0,
          trial_limit: 0,
          is_active: product.active ?? true,
          allow_signups: true,
        })
        if (!error) {
          created++
          results.push({ action: 'created', name: productName, priceId })
        } else {
          results.push({ action: 'error', name: productName, error: error.message })
        }
      }
    }

    return NextResponse.json({
      success: true,
      synced,
      created,
      skipped,
      total: prices.data.length,
      results,
    })
  } catch (err: any) {
    console.error('[stripe-sync] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to sync products from Stripe' },
      { status: 500 }
    )
  }
}
