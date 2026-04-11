import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { addToGeneralAudience } from '@/lib/resend-audiences'
import { sendEmail } from '@/lib/send-email'

/**
 * POST /api/newsletter
 * Lightweight email-only newsletter subscribe for footer form.
 * Adds to General audience in Resend + local newsletter_subscribers table.
 */
export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Please enter a valid email address.' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // Check if already subscribed
    const supabase = createAdminClient()
    const { data: existing } = await supabase
      .from('newsletter_subscribers')
      .select('id, unsubscribed')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (existing && !existing.unsubscribed) {
      return NextResponse.json({ success: true, alreadySubscribed: true })
    }

    // Add to Resend General audience
    await addToGeneralAudience(normalizedEmail)

    // Upsert to local newsletter_subscribers
    await supabase.from('newsletter_subscribers').upsert({
      email: normalizedEmail,
      unsubscribed: false,
      source: 'footer',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' })

    // Send confirmation email
    try {
      await sendEmail({
        to: normalizedEmail,
        subject: "You're subscribed to Production List updates",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1B2A4A;">You're on the list!</h2>
            <p>You'll now receive our weekly production digest with the latest film and television projects in pre-production and production.</p>
            <p>Each week, we compile new and updated productions so you can stay ahead of industry opportunities.</p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="https://productionlist.com/membership-plans" style="background-color: #43B7F0; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Explore Membership Plans
              </a>
            </p>
            <p style="color: #999; font-size: 12px;">
              You can unsubscribe at any time by clicking the link in any of our emails.<br/>
              Film &amp; Television Industry Alliance &middot; 905 N Bethlehem Pk, #44, Spring House, PA 19477
            </p>
          </div>
        `,
        templateSlug: 'newsletter-subscribe',
      })
    } catch {
      // Don't fail the subscription over an email error
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[newsletter] Error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
