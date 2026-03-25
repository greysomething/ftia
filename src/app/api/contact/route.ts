import { NextRequest, NextResponse } from 'next/server'
import { sendEmail } from '@/lib/send-email'
import { getTemplate } from '@/lib/email-templates'

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
      return NextResponse.redirect(
        new URL('/contact?error=send_failed', req.url),
        303
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
        // Log but don't fail — the team already received the message
        console.error('[contact] Failed to send confirmation email:', confirmResult.error)
      }
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
