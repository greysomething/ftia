import { NextRequest, NextResponse } from 'next/server'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const EMAIL_FROM = process.env.EMAIL_FROM ?? 'noreply@productionlist.com'
const CONTACT_TO = process.env.CONTACT_EMAIL ?? 'info@productionlist.com'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const name = String(formData.get('name') ?? '').trim()
    const email = String(formData.get('email') ?? '').trim()
    const subject = String(formData.get('subject') ?? 'general')
    const message = String(formData.get('message') ?? '').trim()

    if (!name || !email || !message) {
      return NextResponse.redirect(
        new URL('/contact?error=missing_fields', req.url),
        303
      )
    }

    if (RESEND_API_KEY) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: CONTACT_TO,
          reply_to: email,
          subject: `[Contact Form] ${subject} — from ${name}`,
          text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\n\n${message}`,
        }),
      })
    } else {
      console.warn('RESEND_API_KEY not configured — contact form email not sent')
    }

    return NextResponse.redirect(
      new URL('/contact?success=true', req.url),
      303
    )
  } catch (err) {
    console.error('Contact form error:', err)
    return NextResponse.redirect(
      new URL('/contact?error=send_failed', req.url),
      303
    )
  }
}
