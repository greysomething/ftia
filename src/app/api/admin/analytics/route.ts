import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { getActiveStripeKeys } from '@/lib/stripe-settings'
import Stripe from 'stripe'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// US Eastern time matches Stripe dashboard's default account timezone
const TIMEZONE = 'America/New_York'

/** Convert a UTC unix-seconds timestamp to YYYY-MM-DD in ET */
function toLocalDateFromUnix(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

interface Bucket {
  newSignups: number
  rebills: number
  signupRevenue: number
  rebillRevenue: number
  revenue: number
  refunds: number
  refundAmount: number
}

function emptyBucket(): Bucket {
  return {
    newSignups: 0, rebills: 0,
    signupRevenue: 0, rebillRevenue: 0, revenue: 0,
    refunds: 0, refundAmount: 0,
  }
}

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = Math.max(1, Math.min(366, parseInt(searchParams.get('days') ?? '30', 10)))

  const { secretKey } = await getActiveStripeKeys()
  if (!secretKey || secretKey.length < 20) {
    return NextResponse.json(
      { error: 'Stripe secret key not configured. Go to Admin > Merchant Settings.' },
      { status: 400 }
    )
  }

  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })

  // Pre-build empty daily buckets in ET (no future dates)
  const today = todayLocal()
  const buckets: Record<string, Bucket> = {}
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
    if (key > today) continue
    buckets[key] = emptyBucket()
  }

  // Compute the unix-seconds cutoff with a 1-day buffer so we don't miss
  // any charges that fall within the earliest ET bucket but are slightly
  // outside its UTC midnight.
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - (days + 1))
  cutoffDate.setHours(0, 0, 0, 0)
  const createdGte = Math.floor(cutoffDate.getTime() / 1000)

  try {
    // ── Pull all charges in window with invoice expanded ──
    // Stripe lets us expand data.invoice in charge.list — that gives us
    // billing_reason directly so we can classify new vs recurring
    // exactly the way Stripe dashboard does.
    let chargeHasMore = true
    let chargeStartingAfter: string | undefined

    while (chargeHasMore) {
      const params: Stripe.ChargeListParams = {
        created: { gte: createdGte },
        limit: 100,
        expand: ['data.invoice'],
      }
      if (chargeStartingAfter) params.starting_after = chargeStartingAfter

      const page = await stripe.charges.list(params)

      for (const charge of page.data) {
        // Only count successful captured charges as revenue
        if (charge.status !== 'succeeded' || !charge.paid) continue

        const dateKey = toLocalDateFromUnix(charge.created)
        const bucket = buckets[dateKey]
        if (!bucket) continue

        const amount = (charge.amount ?? 0) / 100

        // Determine billing reason from expanded invoice.
        // `charge.invoice` exists at runtime for 2024-06-20 API but the
        // newer Stripe TS types narrowed it away — cast to any.
        const invoice = (charge as any).invoice as Stripe.Invoice | string | null | undefined
        let billingReason: string | null = null
        if (invoice && typeof invoice !== 'string') {
          billingReason = invoice.billing_reason ?? null
        }

        const isNewSignup = billingReason === 'subscription_create'

        if (isNewSignup) {
          bucket.newSignups++
          bucket.signupRevenue += amount
        } else {
          bucket.rebills++
          bucket.rebillRevenue += amount
        }
        bucket.revenue += amount
      }

      chargeHasMore = page.has_more
      if (page.data.length > 0) {
        chargeStartingAfter = page.data[page.data.length - 1].id
      } else {
        chargeHasMore = false
      }
    }

    // ── Pull refunds separately (refund.created may differ from charge.created) ──
    let refundHasMore = true
    let refundStartingAfter: string | undefined

    while (refundHasMore) {
      const params: Stripe.RefundListParams = {
        created: { gte: createdGte },
        limit: 100,
      }
      if (refundStartingAfter) params.starting_after = refundStartingAfter

      const page = await stripe.refunds.list(params)

      for (const refund of page.data) {
        if (refund.status !== 'succeeded') continue
        const dateKey = toLocalDateFromUnix(refund.created)
        const bucket = buckets[dateKey]
        if (!bucket) continue

        const amount = (refund.amount ?? 0) / 100
        bucket.refunds++
        bucket.refundAmount += amount
        bucket.revenue -= amount
      }

      refundHasMore = page.has_more
      if (page.data.length > 0) {
        refundStartingAfter = page.data[page.data.length - 1].id
      } else {
        refundHasMore = false
      }
    }

    const chartData = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({ date, ...data }))

    const totalNewSignups = chartData.reduce((s, d) => s + d.newSignups, 0)
    const totalRebills = chartData.reduce((s, d) => s + d.rebills, 0)
    const totalRevenue = chartData.reduce((s, d) => s + d.revenue, 0)
    const totalSignupRevenue = chartData.reduce((s, d) => s + d.signupRevenue, 0)
    const totalRebillRevenue = chartData.reduce((s, d) => s + d.rebillRevenue, 0)
    const totalRefunds = chartData.reduce((s, d) => s + d.refunds, 0)
    const totalRefundAmount = chartData.reduce((s, d) => s + d.refundAmount, 0)

    return NextResponse.json({
      chartData,
      summary: {
        newSignups: totalNewSignups,
        rebills: totalRebills,
        revenue: totalRevenue,
        signupRevenue: totalSignupRevenue,
        rebillRevenue: totalRebillRevenue,
        refunds: totalRefunds,
        refundAmount: totalRefundAmount,
      },
    })
  } catch (err: any) {
    console.error('[analytics] Stripe error:', err)
    return NextResponse.json(
      { error: err.message || 'Failed to fetch Stripe analytics' },
      { status: 500 }
    )
  }
}
