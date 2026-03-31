import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getActiveStripeKeys } from '@/lib/stripe-settings'
import { addToActiveMembers, addToPastMembers, moveToPastMember } from '@/lib/resend-audiences'
import { logActivity } from '@/lib/activity-log'

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

      // Extract card details from the payment method used in checkout
      let cardFields: Record<string, string | null> = {}

      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId as string, {
          expand: ['default_payment_method'],
        })
        periodEnd = new Date((sub as any).current_period_end * 1000).toISOString()

        let pm = (sub as any).default_payment_method
        // Fallback: if subscription has no default_payment_method, check the
        // customer's invoice_settings or list their payment methods directly
        if (!pm?.card && session.customer) {
          try {
            const custId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id
            if (custId) {
              const fullCustomer = await stripe.customers.retrieve(custId, {
                expand: ['invoice_settings.default_payment_method'],
              })
              const invoicePm = (fullCustomer as any)?.invoice_settings?.default_payment_method
              if (invoicePm?.card) {
                pm = invoicePm
              } else {
                const pms = await stripe.paymentMethods.list({
                  customer: custId,
                  type: 'card',
                  limit: 1,
                })
                if (pms.data.length > 0) pm = pms.data[0]
              }
            }
          } catch { /* card details are best-effort */ }
        }

        if (pm?.card) {
          cardFields = {
            card_type: pm.card.brand ?? null,
            card_last4: pm.card.last4 ?? null,
            card_exp_month: String(pm.card.exp_month ?? ''),
            card_exp_year: String(pm.card.exp_year ?? ''),
          }
        }
      }

      // Insert or update membership
      const { data: existingMem } = await supabase
        .from('user_memberships').select('id').eq('user_id', userId).single()

      // Determine the real membership status from the Stripe subscription.
      // If Stripe says 'trialing' but the plan has no trial configured
      // (trial_limit = 0), treat it as 'active' — the user paid, the trial
      // flag is a legacy bug. Only set 'trialing' for plans that genuinely
      // offer a trial period.
      // Always set status to 'active' — even if Stripe says 'trialing',
      // because: (1) no plans currently have trials configured, and
      // (2) the 'trialing' enum value may not exist in the database yet.
      // When real trial plans are added, add the enum value first, then update this logic.
      const memStatus = 'active'

      const memRow = {
        user_id: userId,
        level_id: parseInt(levelId, 10),
        status: memStatus,
        stripe_subscription_id: subscriptionId as string ?? null,
        enddate: periodEnd,
        startdate: new Date().toISOString(),
        ...cardFields,
      }

      if (existingMem) {
        await supabase.from('user_memberships').update(memRow).eq('id', existingMem.id)
      } else {
        await supabase.from('user_memberships').insert(memRow)
      }

      // Log membership change to activity_log
      {
        const { data: prof } = await supabase.from('user_profiles').select('email').eq('id', userId).single()
        logActivity({
          userId,
          email: prof?.email ?? session.customer_email ?? null,
          eventType: 'membership_changed',
          metadata: {
            action: existingMem ? 'renewed' : 'created',
            status: memStatus,
            level_id: parseInt(levelId, 10),
            stripe_subscription_id: subscriptionId ?? null,
          },
          reqHeaders: req.headers,
        }).catch(() => {})
      }

      // Update Stripe customer with name & description from profile
      const stripeCustomerId = typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id
      if (stripeCustomerId) {
        const { data: userProfile } = await supabase
          .from('user_profiles')
          .select('first_name, last_name, email')
          .eq('id', userId)
          .single()
        if (userProfile) {
          const name = [userProfile.first_name, userProfile.last_name].filter(Boolean).join(' ')
          const email = userProfile.email || session.customer_email
          if (name) {
            await stripe.customers.update(stripeCustomerId, {
              name,
              description: email ? `${name} (${email})` : name,
            })
          }
        }
      }

      // Add to Active Members audience (fire-and-forget)
      {
        const { data: profileForAudience } = await supabase
          .from('user_profiles')
          .select('email, first_name, last_name')
          .eq('id', userId)
          .single()
        if (profileForAudience?.email) {
          void addToActiveMembers(profileForAudience.email, profileForAudience.first_name ?? undefined, profileForAudience.last_name ?? undefined)
        }
      }

      // Record order (with duplicate check on payment_transaction_id AND
      // a fallback check for same user+amount within 5 minutes to catch
      // cases where payment_intent is null on the checkout session)
      let checkoutPiId = session.payment_intent as string | null

      // For subscription checkouts, session.payment_intent is often null.
      // Get the real payment_intent from the subscription's latest invoice.
      if (!checkoutPiId && subscriptionId) {
        try {
          const sub = await stripe.subscriptions.retrieve(subscriptionId as string, {
            expand: ['latest_invoice'],
          })
          const latestInvoice = (sub as any).latest_invoice
          if (latestInvoice?.payment_intent) {
            checkoutPiId = typeof latestInvoice.payment_intent === 'string'
              ? latestInvoice.payment_intent
              : latestInvoice.payment_intent?.id ?? null
          }
        } catch { /* best effort */ }
      }

      let checkoutAlreadyRecorded = false
      if (checkoutPiId) {
        const { data: existingCheckout } = await supabase
          .from('membership_orders')
          .select('id')
          .eq('payment_transaction_id', checkoutPiId)
          .limit(1)
        checkoutAlreadyRecorded = !!(existingCheckout && existingCheckout.length > 0)
      }

      // Also check for a recent order with the same user and amount
      // (catches duplicates when payment_intent is null on one side)
      if (!checkoutAlreadyRecorded) {
        const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
        const orderTotal = session.amount_total ? (session.amount_total / 100) : 0
        const { data: recentDup } = await supabase
          .from('membership_orders')
          .select('id')
          .eq('user_id', userId)
          .eq('total', orderTotal)
          .gte('timestamp', fiveMinAgo)
          .limit(1)
        checkoutAlreadyRecorded = !!(recentDup && recentDup.length > 0)
      }

      if (!checkoutAlreadyRecorded) {
        await supabase.from('membership_orders').insert({
          user_id: userId,
          level_id: parseInt(levelId, 10),
          status: 'success',
          total: session.amount_total ? (session.amount_total / 100) : 0,
          gateway: 'stripe',
          payment_transaction_id: checkoutPiId ?? null,
          subscription_transaction_id: subscriptionId as string ?? null,
          billing_reason: 'subscription_create',
        })
      }

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

      // Ensure user stays in Active Members audience (fire-and-forget)
      {
        const { data: profileForAudience } = await supabase
          .from('user_profiles')
          .select('email, first_name, last_name')
          .eq('id', userId)
          .single()
        if (profileForAudience?.email) {
          void addToActiveMembers(profileForAudience.email, profileForAudience.first_name ?? undefined, profileForAudience.last_name ?? undefined)
        }
      }

      // Only record payment for renewals — the initial payment is already
      // recorded by checkout.session.completed. Stripe fires both events
      // for new subscriptions, which was causing duplicate payment records.
      const isInitialInvoice = invoice.billing_reason === 'subscription_create'

      if (levelId && !isInitialInvoice) {
        // Also check for duplicate payment_transaction_id to be safe
        const piId = invoice.payment_intent as string
        let alreadyRecorded = false
        if (piId) {
          const { data: existing } = await supabase
            .from('membership_orders')
            .select('id')
            .eq('payment_transaction_id', piId)
            .limit(1)
          alreadyRecorded = !!(existing && existing.length > 0)
        }

        if (!alreadyRecorded) {
          await supabase.from('membership_orders').insert({
            user_id: userId,
            level_id: parseInt(levelId, 10),
            status: 'success',
            total: invoice.amount_paid ? (invoice.amount_paid / 100) : 0,
            gateway: 'stripe',
            payment_transaction_id: piId ?? null,
            subscription_transaction_id: subscriptionId as string ?? null,
            billing_reason: invoice.billing_reason ?? 'subscription_cycle',
          })
        }
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

      // Log membership expiry
      {
        const { data: prof } = await supabase.from('user_profiles').select('email').eq('id', userId).single()
        logActivity({
          userId,
          email: prof?.email ?? null,
          eventType: 'membership_changed',
          metadata: { action: 'expired', stripe_subscription_id: sub.id },
          reqHeaders: req.headers,
        }).catch(() => {})
      }

      // Move to Past Members audience (fire-and-forget)
      {
        const { data: profileForAudience } = await supabase
          .from('user_profiles')
          .select('email, first_name, last_name')
          .eq('id', userId)
          .single()
        if (profileForAudience?.email) {
          void moveToPastMember(profileForAudience.email, profileForAudience.first_name ?? undefined, profileForAudience.last_name ?? undefined)
        }
      }

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

      // Move to Past Members audience (fire-and-forget)
      {
        const { data: profileForAudience } = await supabase
          .from('user_profiles')
          .select('email, first_name, last_name')
          .eq('id', userId)
          .single()
        if (profileForAudience?.email) {
          void moveToPastMember(profileForAudience.email, profileForAudience.first_name ?? undefined, profileForAudience.last_name ?? undefined)
        }
      }

      break
    }

    // ---- Dispute handling ----
    case 'charge.dispute.created': {
      const dispute = event.data.object
      const customerId = dispute.customer

      if (!customerId) break

      // Find membership(s) by stripe_customer_id and suspend
      const { data: memberships } = await supabase
        .from('user_memberships')
        .select('id, user_id, level_id, status')
        .eq('stripe_customer_id', customerId)
        .eq('status', 'active')

      if (!memberships?.length) break

      for (const mem of memberships) {
        await supabase
          .from('user_memberships')
          .update({
            status: 'suspended',
            modified: new Date().toISOString(),
          })
          .eq('id', mem.id)

        // Log dispute in membership_orders for audit trail (with duplicate check)
        const disputePiId = dispute.payment_intent as string | null
        let disputeAlreadyRecorded = false
        if (disputePiId) {
          const { data: existingDispute } = await supabase
            .from('membership_orders')
            .select('id')
            .eq('payment_transaction_id', disputePiId)
            .eq('status', 'dispute_opened')
            .limit(1)
          disputeAlreadyRecorded = !!(existingDispute && existingDispute.length > 0)
        }

        if (!disputeAlreadyRecorded) {
          await supabase.from('membership_orders').insert({
            user_id: mem.user_id,
            level_id: mem.level_id,
            status: 'dispute_opened',
            total: dispute.amount ? -(dispute.amount / 100) : 0,
            gateway: 'stripe',
            payment_transaction_id: disputePiId ?? null,
            notes: `Dispute opened: ${dispute.reason || 'No reason given'}. Dispute ID: ${dispute.id}. Account suspended pending resolution.`,
          })
        }
      }

      console.log(`[Stripe Webhook] Dispute created (${dispute.id}) — suspended ${memberships.length} membership(s) for customer ${customerId}`)
      break
    }

    case 'charge.dispute.closed': {
      const dispute = event.data.object
      const customerId = dispute.customer

      if (!customerId) break

      // Find suspended membership(s) for this customer
      const { data: memberships } = await supabase
        .from('user_memberships')
        .select('id, user_id, level_id, status, enddate')
        .eq('stripe_customer_id', customerId)
        .eq('status', 'suspended')

      if (!memberships?.length) break

      const disputeWon = dispute.status === 'won'

      for (const mem of memberships) {
        if (disputeWon) {
          // Dispute won — reactivate membership
          await supabase
            .from('user_memberships')
            .update({
              status: 'active',
              modified: new Date().toISOString(),
            })
            .eq('id', mem.id)
        }
        // If lost, keep status as 'suspended' — admin must manually handle

        await supabase.from('membership_orders').insert({
          user_id: mem.user_id,
          level_id: mem.level_id,
          status: disputeWon ? 'dispute_won' : 'dispute_lost',
          total: dispute.amount ? (disputeWon ? 0 : -(dispute.amount / 100)) : 0,
          gateway: 'stripe',
          payment_transaction_id: dispute.payment_intent as string ?? null,
          notes: disputeWon
            ? `Dispute won (${dispute.id}). Membership reactivated.`
            : `Dispute lost (${dispute.id}). Membership remains suspended. Admin action required.`,
        })
      }

      console.log(`[Stripe Webhook] Dispute ${dispute.status} (${dispute.id}) for customer ${customerId}`)
      break
    }

    case 'charge.dispute.updated': {
      // Log dispute updates for visibility but don't change status
      const dispute = event.data.object
      console.log(`[Stripe Webhook] Dispute updated (${dispute.id}): status=${dispute.status}, reason=${dispute.reason}`)
      break
    }

    // ---- Refund handling ----
    case 'charge.refunded': {
      const charge = event.data.object
      const customerId = typeof charge.customer === 'string' ? charge.customer : (charge.customer as any)?.id
      if (!customerId) break

      // Find user by stripe_customer_id
      const { data: membershipForRefund } = await supabase
        .from('user_memberships')
        .select('id, user_id, level_id')
        .eq('stripe_customer_id', customerId)
        .limit(1)
        .single()

      if (!membershipForRefund) break

      // Calculate refund amount (total refunded - could be partial)
      const refundAmount = charge.amount_refunded ? (charge.amount_refunded / 100) : 0
      const refundPiId = charge.payment_intent as string | null

      // Check for duplicate refund record (same payment_intent + refunded status)
      let refundAlreadyRecorded = false
      if (refundPiId) {
        const { data: existingRefund } = await supabase
          .from('membership_orders')
          .select('id')
          .eq('payment_transaction_id', refundPiId)
          .eq('status', 'refunded')
          .limit(1)
        refundAlreadyRecorded = !!(existingRefund && existingRefund.length > 0)
      }

      if (!refundAlreadyRecorded) {
        await supabase.from('membership_orders').insert({
          user_id: membershipForRefund.user_id,
          level_id: membershipForRefund.level_id,
          status: 'refunded',
          total: -refundAmount,
          gateway: 'stripe',
          payment_transaction_id: refundPiId ?? null,
          notes: `Refund of $${refundAmount.toFixed(2)}${charge.refunds?.data?.[0]?.reason ? ` — Reason: ${charge.refunds.data[0].reason}` : ''}`,
        })
      }

      console.log(`[Stripe Webhook] Charge refunded: $${refundAmount} for customer ${customerId}`)
      break
    }

    // ---- Subscription updates (plan changes, metadata) ----
    case 'customer.subscription.updated': {
      const sub = event.data.object
      const customerId = typeof sub.customer === 'string' ? sub.customer : (sub.customer as any)?.id
      if (!customerId) break

      const { data: membershipForUpdate } = await supabase
        .from('user_memberships')
        .select('id, user_id')
        .eq('stripe_customer_id', customerId)
        .limit(1)
        .single()

      if (!membershipForUpdate) break

      // Map Stripe subscription status to our database enum.
      // Note: 'trialing' and 'past_due' are not yet valid enum values,
      // so we map them to 'active' and 'expired' respectively for now.
      let updatedStatus: string
      switch (sub.status) {
        case 'active':
          updatedStatus = sub.cancel_at_period_end ? 'cancelled' : 'active'; break
        case 'trialing':
          updatedStatus = 'active'; break  // no real trial plans exist yet
        case 'past_due':
          updatedStatus = 'active'; break  // keep access while payment retries
        case 'canceled':
          updatedStatus = 'cancelled'; break
        default:
          updatedStatus = 'expired'; break
      }

      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null

      // Extract card details if payment method expanded
      const pm = sub.default_payment_method as any
      const cardUpdate = pm?.card ? {
        card_type: pm.card.brand ?? null,
        card_last4: pm.card.last4 ?? null,
        card_exp_month: String(pm.card.exp_month ?? ''),
        card_exp_year: String(pm.card.exp_year ?? ''),
      } : {}

      // Map price to level
      const updPriceId = sub.items?.data?.[0]?.price?.id
      let updLevelId: number | undefined
      if (updPriceId) {
        // Look up level by stripe_price_id
        const { data: matchedLevel } = await supabase
          .from('membership_levels')
          .select('id')
          .eq('stripe_price_id', updPriceId)
          .single()
        if (matchedLevel) updLevelId = matchedLevel.id
      }

      await supabase
        .from('user_memberships')
        .update({
          status: updatedStatus,
          enddate: periodEnd,
          stripe_subscription_id: sub.id,
          modified: new Date().toISOString(),
          ...cardUpdate,
          ...(updLevelId ? { level_id: updLevelId } : {}),
        })
        .eq('id', membershipForUpdate.id)

      // Update audience based on new status (fire-and-forget)
      if (membershipForUpdate) {
        const { data: profileForAudience } = await supabase
          .from('user_profiles')
          .select('email, first_name, last_name')
          .eq('id', membershipForUpdate.user_id)
          .single()
        if (profileForAudience?.email) {
          if (updatedStatus === 'active' || updatedStatus === 'trialing') {
            void addToActiveMembers(profileForAudience.email, profileForAudience.first_name ?? undefined, profileForAudience.last_name ?? undefined)
          } else if (updatedStatus === 'cancelled' || updatedStatus === 'expired') {
            void moveToPastMember(profileForAudience.email, profileForAudience.first_name ?? undefined, profileForAudience.last_name ?? undefined)
          }
        }
      }

      // Log membership status change
      logActivity({
        userId: membershipForUpdate.user_id,
        eventType: 'membership_changed',
        metadata: {
          action: 'status_changed',
          status: updatedStatus,
          stripe_status: sub.status,
          stripe_subscription_id: sub.id,
          cancel_at_period_end: sub.cancel_at_period_end ?? false,
        },
        reqHeaders: req.headers,
      }).catch(() => {})

      console.log(`[Stripe Webhook] Subscription updated (${sub.id}): status=${sub.status} for customer ${customerId}`)
      break
    }

    default:
      break
  }

  return NextResponse.json({ received: true })
}
