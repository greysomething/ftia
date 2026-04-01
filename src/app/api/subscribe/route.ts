import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createAdminClient } from '@/lib/supabase/server'

const resend = new Resend(process.env.RESEND_API_KEY)

// Resend audience ID for the mailing list — set in .env.local
const AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID ?? ''

export async function POST(request: Request) {
  try {
    const { name, email, role, country } = await request.json()

    // Basic validation
    if (!name || !email) {
      return NextResponse.json(
        { error: 'Name and email are required.' },
        { status: 400 },
      )
    }

    const firstName = name.split(' ')[0]
    const lastName = name.split(' ').slice(1).join(' ') || undefined

    // Add contact to Resend audience (mailing list)
    if (AUDIENCE_ID) {
      await resend.contacts.create({
        audienceId: AUDIENCE_ID,
        email,
        firstName,
        lastName,
        unsubscribed: false,
      })
    }

    // Also save to Supabase for fast digest queries
    const supabase = createAdminClient()
    await supabase.from('newsletter_subscribers').upsert({
      email: email.toLowerCase(),
      first_name: firstName || null,
      last_name: lastName || null,
      unsubscribed: false,
      source: 'website',
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' }).catch(() => {})

    // Also send a welcome / notification email
    await resend.emails.send({
      from: 'Production List <noreply@productionlist.com>',
      to: email,
      subject: 'Welcome to Production List — Complete Your Membership',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1B2A4A;">Welcome to Production List, ${name.split(' ')[0]}!</h2>
          <p>Thank you for your interest in joining FTIA's Production List — the most comprehensive directory of active film and television productions in pre-production.</p>
          <p><strong>Industry Role:</strong> ${role}<br/>
          <strong>Country/Zone:</strong> ${country}</p>
          <p>To complete your membership and get immediate access to our database, please select a plan:</p>
          <p style="text-align: center; margin: 24px 0;">
            <a href="https://productionlist.com/membership-plans" style="background-color: #43B7F0; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Choose Your Plan
            </a>
          </p>
          <p style="color: #666; font-size: 12px;">Film &amp; Television Industry Alliance<br/>905 N Bethlehem Pk, #44, Spring House, PA 19477</p>
        </div>
      `,
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    console.error('[subscribe] Error:', err)
    return NextResponse.json(
      { error: 'Failed to subscribe. Please try again.' },
      { status: 500 },
    )
  }
}
