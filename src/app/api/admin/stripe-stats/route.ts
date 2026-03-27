import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { getActiveStripeKeys } from '@/lib/stripe-settings'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Period = 'mtd' | 'last30' | 'last4w' | 'last12m' | 'ytd'

function getPeriodRange(period: Period): { start: Date; label: string } {
  const now = new Date()

  switch (period) {
    case 'mtd':
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        label: 'Month to Date',
      }
    case 'last30':
      return {
        start: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
        label: 'Last 30 Days',
      }
    case 'last4w':
      return {
        start: new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000),
        label: 'Last 4 Weeks',
      }
    case 'last12m':
      return {
        start: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()),
        label: 'Last 12 Months',
      }
    case 'ytd':
      return {
        start: new Date(now.getFullYear(), 0, 1),
        label: 'Year to Date',
      }
    default:
      return {
        start: new Date(now.getFullYear(), now.getMonth(), 1),
        label: 'Month to Date',
      }
  }
}

/**
 * GET /api/admin/stripe-stats?period=mtd
 *
 * Queries Stripe directly for accurate revenue analytics.
 * Paginates through all charges in the period and calculates
 * MRR from active subscriptions.
 */
export async function GET(request: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { secretKey } = await getActiveStripeKeys()
  if (!secretKey || secretKey.length < 20) {
    return NextResponse.json(
      { error: 'Stripe secret key not configured. Go to Admin > Merchant Settings.' },
      { status: 400 }
    )
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2025-02-24.acacia' as any })

  const { searchParams } = new URL(request.url)
  const period = (searchParams.get('period') || 'mtd') as Period
  const validPeriods: Period[] = ['mtd', 'last30', 'last4w', 'last12m', 'ytd']
  if (!validPeriods.includes(period)) {
    return NextResponse.json(
      { error: `Invalid period. Use one of: ${validPeriods.join(', ')}` },
      { status: 400 }
    )
  }

  const { start, label } = getPeriodRange(period)
  const createdGte = Math.floor(start.getTime() / 1000)

  try {
    // ── Paginate through ALL charges in the period ──
    let grossVolume = 0
    let netVolume = 0
    let paymentCount = 0
    let failedCount = 0
    let failedVolume = 0
    let refundCount = 0
    let refundVolume = 0

    let hasMore = true
    let startingAfter: string | undefined

    while (hasMore) {
      const params: Stripe.ChargeListParams = {
        created: { gte: createdGte },
        limit: 100,
      }
      if (startingAfter) {
        params.starting_after = startingAfter
      }

      const charges = await stripe.charges.list(params)

      for (const charge of charges.data) {
        if (charge.status === 'succeeded') {
          paymentCount++
          grossVolume += charge.amount
          // Net = charge amount minus any refunds applied
          const refunded = charge.amount_refunded || 0
          netVolume += charge.amount - refunded

          if (refunded > 0) {
            refundCount++
            refundVolume += refunded
          }
        } else if (charge.status === 'failed') {
          failedCount++
          failedVolume += charge.amount
        }
      }

      hasMore = charges.has_more
      if (charges.data.length > 0) {
        startingAfter = charges.data[charges.data.length - 1].id
      } else {
        hasMore = false
      }
    }

    const avgTransaction = paymentCount > 0 ? Math.round(grossVolume / paymentCount) : 0

    // ── Calculate MRR from active subscriptions ──
    let stripeMrr = 0
    let subHasMore = true
    let subStartingAfter: string | undefined

    while (subHasMore) {
      const subParams: Stripe.SubscriptionListParams = {
        status: 'active',
        limit: 100,
      }
      if (subStartingAfter) {
        subParams.starting_after = subStartingAfter
      }

      const subs = await stripe.subscriptions.list(subParams)

      for (const sub of subs.data) {
        const item = sub.items.data[0]
        if (!item?.price) continue

        const unitAmount = item.price.unit_amount || 0
        const quantity = item.quantity || 1
        const interval = item.price.recurring?.interval

        if (interval === 'month') {
          stripeMrr += unitAmount * quantity
        } else if (interval === 'year') {
          stripeMrr += Math.round((unitAmount * quantity) / 12)
        } else if (interval === 'week') {
          stripeMrr += Math.round((unitAmount * quantity * 52) / 12)
        } else if (interval === 'day') {
          stripeMrr += Math.round((unitAmount * quantity * 365) / 12)
        }
      }

      subHasMore = subs.has_more
      if (subs.data.length > 0) {
        subStartingAfter = subs.data[subs.data.length - 1].id
      } else {
        subHasMore = false
      }
    }

    return NextResponse.json({
      grossVolume,
      netVolume,
      paymentCount,
      failedCount,
      failedVolume,
      refundCount,
      refundVolume,
      avgTransaction,
      stripeMrr,
      period,
      periodLabel: label,
    })
  } catch (err: any) {
    console.error('[stripe-stats] Error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to fetch Stripe stats' },
      { status: 500 }
    )
  }
}
