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
    // ── Volume from balance_transactions (matches Stripe dashboard exactly) ──
    let grossVolume = 0
    let netVolume = 0
    let totalFees = 0
    let refundVolume = 0
    let refundCount = 0
    let paymentCount = 0

    let btHasMore = true
    let btStartingAfter: string | undefined

    while (btHasMore) {
      const btParams: Stripe.BalanceTransactionListParams = {
        created: { gte: createdGte },
        limit: 100,
      }
      if (btStartingAfter) btParams.starting_after = btStartingAfter

      const txns = await stripe.balanceTransactions.list(btParams)

      for (const txn of txns.data) {
        if (txn.type === 'charge' || txn.type === 'payment') {
          grossVolume += txn.amount
          totalFees += txn.fee
          netVolume += txn.net
          paymentCount++
        } else if (txn.type === 'refund') {
          // Refund amounts are negative in balance_transactions
          refundVolume += Math.abs(txn.amount)
          netVolume += txn.net // negative net
          refundCount++
        } else if (txn.type === 'adjustment' || txn.type === 'stripe_fee' || txn.type === 'payment_refund') {
          netVolume += txn.net
        }
      }

      btHasMore = txns.has_more
      if (txns.data.length > 0) {
        btStartingAfter = txns.data[txns.data.length - 1].id
      } else {
        btHasMore = false
      }
    }

    // ── Failed charges (not in balance_transactions, need charges API) ──
    let failedCount = 0
    let failedVolume = 0
    let chHasMore = true
    let chStartingAfter: string | undefined

    while (chHasMore) {
      const chParams: Stripe.ChargeListParams = {
        created: { gte: createdGte },
        limit: 100,
      }
      if (chStartingAfter) chParams.starting_after = chStartingAfter

      const charges = await stripe.charges.list(chParams)

      for (const charge of charges.data) {
        if (charge.status === 'failed') {
          failedCount++
          failedVolume += charge.amount
        }
      }

      chHasMore = charges.has_more
      if (charges.data.length > 0) {
        chStartingAfter = charges.data[charges.data.length - 1].id
      } else {
        chHasMore = false
      }
    }

    const avgTransaction = paymentCount > 0 ? Math.round(grossVolume / paymentCount) : 0

    // ── Calculate MRR from active subscriptions ──
    // Exclude subscriptions set to cancel at period end (churning)
    // Account for coupon/discount on each subscription
    let stripeMrr = 0
    let subHasMore = true
    let subStartingAfter: string | undefined

    while (subHasMore) {
      const subParams: Stripe.SubscriptionListParams = {
        status: 'active',
        limit: 100,
        expand: ['data.discount', 'data.discounts'],
      }
      if (subStartingAfter) {
        subParams.starting_after = subStartingAfter
      }

      const subs = await stripe.subscriptions.list(subParams)

      for (const sub of subs.data) {
        // Skip subscriptions that are canceling — they won't renew
        if (sub.cancel_at_period_end) continue

        const item = sub.items.data[0]
        if (!item?.price) continue

        let unitAmount = item.price.unit_amount || 0
        const quantity = item.quantity || 1
        const interval = item.price.recurring?.interval
        const intervalCount = item.price.recurring?.interval_count || 1

        // Account for subscription-level discounts
        const discounts = (sub as any).discounts ?? (sub as any).discount ? [(sub as any).discount] : []
        for (const d of Array.isArray(discounts) ? discounts : []) {
          const coupon = d?.coupon
          if (!coupon) continue
          if (coupon.percent_off) {
            unitAmount = Math.round(unitAmount * (1 - coupon.percent_off / 100))
          } else if (coupon.amount_off) {
            unitAmount = Math.max(0, unitAmount - coupon.amount_off)
          }
        }

        // Convert to monthly equivalent, accounting for interval_count
        // e.g. $150 every 3 months = $50/month, $579 every 1 year = $48.25/month
        const chargeAmount = unitAmount * quantity
        let monthlyAmount = 0
        if (interval === 'month') {
          monthlyAmount = Math.round(chargeAmount / intervalCount)
        } else if (interval === 'year') {
          monthlyAmount = Math.round(chargeAmount / (12 * intervalCount))
        } else if (interval === 'week') {
          monthlyAmount = Math.round((chargeAmount * 52) / (12 * intervalCount))
        } else if (interval === 'day') {
          monthlyAmount = Math.round((chargeAmount * 365) / (12 * intervalCount))
        }

        stripeMrr += monthlyAmount
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
      totalFees,
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
