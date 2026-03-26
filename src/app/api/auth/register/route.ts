import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate } from '@/lib/email-templates'
import { logActivity } from '@/lib/activity-log'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const RESEND_AUDIENCE_ID = process.env.RESEND_AUDIENCE_ID

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      email,
      password,
      firstName,
      lastName,
      organizationName,
      organizationType,
      country,
      bio,
      linkedin,
      website,
    } = body

    if (!email || !password || !firstName) {
      return NextResponse.json(
        { error: 'Email, password, and first name are required.' },
        { status: 400 }
      )
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters.' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // 1. Create the auth user server-side (bypasses default Supabase email)
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm since we handle our own welcome email
      user_metadata: {
        full_name: `${firstName} ${lastName ?? ''}`.trim(),
        first_name: firstName,
        last_name: lastName ?? '',
      },
    })

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 })
    }

    const userId = authData.user.id

    // 2. Upsert user_profiles row
    const { error: profileError } = await supabase.from('user_profiles').upsert({
      id: userId,
      email,
      first_name: firstName,
      last_name: lastName ?? '',
      display_name: `${firstName} ${lastName ?? ''}`.trim(),
      organization_name: organizationName ?? '',
      organization_type: organizationType ?? '',
      country: country ?? '',
      description: bio ?? '',
      linkedin: linkedin ?? '',
      website: website ?? '',
    })

    if (profileError) {
      console.error('[register] Failed to upsert user_profiles:', profileError)
      // Don't fail the whole registration — the auth user was created successfully
    }

    // 3. Send welcome email using the template
    const welcomeTemplate = getTemplate('welcome')
    if (welcomeTemplate) {
      const { subject, html } = welcomeTemplate.render({
        firstName,
        role: organizationType ?? '',
        country: country ?? '',
      })

      await sendEmail({
        to: email,
        subject,
        html,
        templateSlug: 'welcome',
      })
    }

    // 4. Add user to the Resend newsletter audience
    if (RESEND_API_KEY && RESEND_AUDIENCE_ID) {
      try {
        await fetch(`https://api.resend.com/audiences/${RESEND_AUDIENCE_ID}/contacts`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            email,
            first_name: firstName,
            last_name: lastName ?? '',
            unsubscribed: false,
          }),
        })
      } catch (audienceErr) {
        // Don't fail registration if audience add fails
        console.error('[register] Failed to add contact to Resend audience:', audienceErr)
      }
    }

    // 5. Log registration event
    void logActivity({
      userId,
      email,
      eventType: 'register',
      metadata: { country: country ?? '', organizationType: organizationType ?? '' },
      reqHeaders: req.headers,
    })

    return NextResponse.json({ success: true, userId })
  } catch (err: any) {
    console.error('[register] Unexpected error:', err)
    return NextResponse.json(
      { error: err?.message ?? 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
