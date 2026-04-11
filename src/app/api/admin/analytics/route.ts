import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'
import { getActiveStripeKeys } from '@/lib/stripe-settings'

export const dynamic = 'force-dynamic'

// Use US Eastern time for date bucketing — matches Stripe dashboard
const TIMEZONE = 'America/New_York'

/** Convert a Unix timestamp (seconds) to YYYY-MM-DD in ET */
function toLocalDate(epochSeconds: number): string {
  return new Date(epochSeconds * 1000).toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

/** Get today's date in ET */
function todayLocal(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE })
}

export async function GET(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const days = Math.max(1, Math.min(366, parseInt(searchParams.get('days') ?? '30', 10)))

  const { secretKey } = await getActiveStripeKeys()
  if (!secretKey) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 })
  }

  const Stripe = (await import('stripe')).default
  const stripe = new Stripe(secretKey, { apiVersion: '2024-06-20' as any })

  // Calculate the start timestamp for the date range
  const since = new Date()
  since.setDate(since.getDate() - days)
  const createdGte = Math.floor(since.getTime() / 1000)

  // Build daily buckets using ET dates
  const buckets: Record<string, {
    newSignups: number; rebills: number
    signupRevenue: number; rebillRevenue: number; revenue: number
    refunds: number; refundAmount: number
  }> = {}

  const today = todayLocal()
  for (let i = 0; i < days; i++) {
    const d = new Date()
    d.setDate(d.getDate() - (days - 1 - i))
    const key = d.toLocaleDateString('en-CA', { timeZone: TIMEZONE })
    if (key > today) continue
    buckets[key] = {
      newSignups: 0, rebills: 0,
      signupRevenue: 0, rebillRevenue: 0, revenue: 0,
      refunds: 0, refundAmount: 0,
    }
  }

  try {
    // Fetch paid invoices from Stripe (auto-paginate)
    // This gives us billing_reason directly for new vs recurring classification
    const invoiceParams: any = {
      created: { gte: createdGte },
      status: 'paid',
      limit: 100,
    }

    let hasMore = true
    let startingAfter: string | undefined

    while (hasMore) {
      if (startingAfter) invoiceParams.starting_after = startingAfter

      const invoices = await stripe.invoices.list(invoiceParams)

      for (const inv of invoices.data) {
        const date = toLocalDate(inv.created)
        if (!buckets[date]) continue

        const amount = (inv.amount_paid ?? 0) / 100

        if (inv.billing_reason === 'subscription_create') {
          buckets[date].newSignups++
          buckets[date].signupRevenue += amount
        } else {
          // subscription_cycle, subscription_update, manual, etc. = recurring
          buckets[date].rebills++
          buckets[date].rebillRevenue += amount
        }
        buckets[date].revenue += amount
      }

      hasMore = invoices.has_more
      if (invoices.data.length > 0) {
        startingAfter = invoices.data[invoices.data.length - 1].id
      } else {
        hasMore = false
      }
    }

    // Fetch refunds from Stripe (auto-paginate)
    const refundParams: any = {
      created: { gte: createdGte },
      limit: 100,
    }

    hasMore = true
    startingAfter = undefined

    while (hasMore) {
      if (startingAfter) refundParams.starting_after = startingAfter

      const refunds = await stripe.refunds.list(refundParams)

      for (const ref of refunds.data) {
        if (!ref.created) continue
        const date = toLocalDate(ref.created)
        if (!buckets[date]) continue

        const amount = (ref.amount ?? 0) / 100
        buckets[date].refunds++
        buckets[date].refundAmount += amount
        buckets[date].revenue -= amount
      }

      hasMore = refunds.has_more
      if (refunds.data.length > 0) {
        startingAfter = refunds.data[refunds.data.length - 1].id
      } else {
        hasMore = false
      }
    }
  } catch (err: any) {
    console.error('[analytics] Stripe API error:', err)
    return NextResponse.json({ error: `Stripe API error: ${err.message}` }, { status: 500 })
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
}
