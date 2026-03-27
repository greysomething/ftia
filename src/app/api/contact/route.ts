import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate } from '@/lib/email-templates'
import { logActivity } from '@/lib/activity-log'

const CONTACT_TO = process.env.CONTACT_EMAIL ?? 'hello@support.productionlist.com'
const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY || ''

// ---------------------------------------------------------------------------
// Cloudflare Turnstile verification
// ---------------------------------------------------------------------------
async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true // skip if not configured

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: TURNSTILE_SECRET,
        response: token,
        ...(ip ? { remoteip: ip } : {}),
      }),
    })
    const data = await res.json()
    return data.success === true
  } catch (err) {
    console.error('[contact] Turnstile verification error:', err)
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const subject = String(formData.get('subject') ?? 'general')
    const message = String(formData.get('message') ?? '').trim()
    const honeypot = String(formData.get('website') ?? '').trim()
    const turnstileToken = String(formData.get('cf-turnstile-response') ?? '')

    // Honeypot check — real users never fill this in
    if (honeypot) {
      // Pretend success so bots think it worked
      return NextResponse.json({ success: true })
    }

    if (!name || !email || !message) {
      return NextResponse.json(
        { success: false, error: 'Please fill out all required fields.' },
        { status: 400 }
      )
    }

    // Verify Turnstile CAPTCHA
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null
    const turnstileValid = await verifyTurnstile(turnstileToken, ip)
    if (!turnstileValid) {
      return NextResponse.json(
        { success: false, error: 'CAPTCHA verification failed. Please try again.' },
        { status: 403 }
      )
    }

    // 1. Send the contact form message to the team
    const teamResult = await sendEmail({
      to: CONTACT_TO,
      subject: `[Contact Form] ${subject} — from ${name}`,
      html: `<p><strong>Name:</strong> ${name}</p>
             <p><strong>Email:</strong> ${email}</p>
             <p><strong>Subject:</strong> ${subject}</p>
             <hr/>
             <p>${message.replace(/\n/g, '<br/>')}</p>`,
      replyTo: email,
      templateSlug: 'contact-internal',
    })

    if (!teamResult.success) {
      console.error('[contact] Failed to send team email:', teamResult.error)
      return NextResponse.json(
        { success: false, error: 'Failed to send message. Please try again.' },
        { status: 500 }
      )
    }

    // 2. Send a confirmation email back to the submitter
    const confirmationTemplate = getTemplate('contact-confirmation')
    if (confirmationTemplate) {
      const firstName = name.split(/\s+/)[0] ?? name
      const { subject: confirmSubject, html: confirmHtml } = confirmationTemplate.render({
        firstName,
        subject,
      })

      const confirmResult = await sendEmail({
        to: email,
        subject: confirmSubject,
        html: confirmHtml,
        templateSlug: 'contact-confirmation',
      })

      if (!confirmResult.success) {
        console.error('[contact] Failed to send confirmation email:', confirmResult.error)
      }
    }

    // Log contact form submission (fire-and-forget)
    logActivity({
      eventType: 'contact_form',
      email,
      metadata: { name, subject },
      reqHeaders: req.headers,
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Contact form error:', err)
    return NextResponse.json(
      { success: false, error: 'Something went wrong. Please try again.' },
      { status: 500 }
    )
  }
}
