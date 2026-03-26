/**
 * Email template definitions for transactional emails.
 * Each template has a unique slug, metadata, and a render function
 * that produces subject + HTML given dynamic variables.
 */

export interface EmailTemplate {
  slug: string
  name: string
  description: string
  category: 'onboarding' | 'auth' | 'membership' | 'notification' | 'marketing'
  /** Variable names this template expects */
  variables: string[]
  /** Render subject + html from variables */
  render: (vars: Record<string, string>) => { subject: string; html: string }
}

const BRAND = {
  color: '#1B2A4A',
  accent: '#43B7F0',
}

function unsubscribeUrl(email?: string): string {
  if (email) return `https://productionlist.com/unsubscribe?email=${encodeURIComponent(email)}`
  return 'https://productionlist.com/unsubscribe'
}

function footer(email?: string): string {
  return `<p style="color: #999; font-size: 11px; margin-top: 32px; border-top: 1px solid #eee; padding-top: 16px;">
    Film &amp; Television Industry Alliance<br/>
    905 N Bethlehem Pk, #44, Spring House, PA 19477<br/>
    <a href="${unsubscribeUrl(email)}" style="color:#999;">Unsubscribe</a>
  </p>`
}

function wrap(body: string, email?: string): string {
  return `<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px;">
    ${body}
    ${footer(email)}
  </div>`
}

export const emailTemplates: EmailTemplate[] = [
  {
    slug: 'welcome',
    name: 'Welcome Email',
    description: 'Sent when a new member signs up via the subscribe form.',
    category: 'onboarding',
    variables: ['firstName', 'role', 'country'],
    render: (vars) => ({
      subject: 'Welcome to Production List — Complete Your Membership',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Welcome to Production List, ${vars.firstName || 'there'}!</h2>
        <p>Thank you for your interest in joining FTIA's Production List — the most comprehensive directory of active film and television productions in pre-production.</p>
        ${vars.role ? `<p><strong>Industry Role:</strong> ${vars.role}</p>` : ''}
        ${vars.country ? `<p><strong>Country/Zone:</strong> ${vars.country}</p>` : ''}
        <p>To complete your membership and get immediate access to our database, please select a plan:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="https://productionlist.com/membership-plans" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Choose Your Plan
          </a>
        </p>
      `),
    }),
  },
  {
    slug: 'password-reset',
    name: 'Password Reset',
    description: 'Sent when a user requests a password reset link.',
    category: 'auth',
    variables: ['firstName', 'resetLink'],
    render: (vars) => ({
      subject: 'Reset Your Production List Password',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Password Reset Request</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>We received a request to reset your Production List password. Click the button below to choose a new password:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="${vars.resetLink || 'https://productionlist.com/reset-password'}" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </p>
        <p style="color: #666; font-size: 13px;">If you didn't request this, you can safely ignore this email. This link expires in 24 hours.</p>
      `),
    }),
  },
  {
    slug: 'membership-confirmation',
    name: 'Membership Confirmation',
    description: 'Sent after successful payment and membership activation.',
    category: 'membership',
    variables: ['firstName', 'planName', 'expiresAt'],
    render: (vars) => ({
      subject: 'Your Production List Membership is Active!',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Membership Confirmed</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>Your <strong>${vars.planName || 'Production List'}</strong> membership is now active. You have full access to our production database.</p>
        ${vars.expiresAt ? `<p><strong>Valid through:</strong> ${vars.expiresAt}</p>` : ''}
        <p style="text-align: center; margin: 24px 0;">
          <a href="https://productionlist.com/production-list" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Browse Productions
          </a>
        </p>
        <p>Thank you for supporting FTIA and the film &amp; television community.</p>
      `),
    }),
  },
  {
    slug: 'membership-renewal-reminder',
    name: 'Membership Renewal Reminder',
    description: 'Sent 7 days before membership expiration.',
    category: 'membership',
    variables: ['firstName', 'planName', 'expiresAt'],
    render: (vars) => ({
      subject: 'Your Production List Membership Expires Soon',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Renewal Reminder</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>Your <strong>${vars.planName || 'Production List'}</strong> membership expires on <strong>${vars.expiresAt || 'soon'}</strong>.</p>
        <p>Renew now to keep uninterrupted access to production listings, crew contacts, and weekly updates.</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="https://productionlist.com/membership-plans" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Renew Membership
          </a>
        </p>
      `),
    }),
  },
  {
    slug: 'weekly-digest',
    name: 'Weekly Production Digest',
    description: 'Weekly summary of new and updated productions with full production listing.',
    category: 'marketing',
    variables: ['firstName', 'weekDate', 'weekEndDate', 'productionCount', 'digestUrl', 'productionsHtml', 'recipientEmail'],
    render: (vars) => ({
      subject: `Production List: ${vars.productionCount || ''} Productions This Week — ${vars.weekDate || 'This Week'}`,
      html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f4;padding:20px 0;">
<tr><td align="center">
<table width="640" cellpadding="0" cellspacing="0" style="max-width:640px;width:100%;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

  <!-- Header -->
  <tr>
    <td style="background-color:${BRAND.color};padding:24px 32px;text-align:center;">
      <img src="https://productionlist.com/images/pl-emblem.png" alt="PL" width="40" height="40" style="display:inline-block;vertical-align:middle;margin-right:12px;" />
      <span style="display:inline-block;vertical-align:middle;text-align:left;">
        <span style="color:white;font-size:22px;font-weight:700;letter-spacing:0.5px;display:block;">Production List</span>
        <span style="color:rgba(255,255,255,0.7);font-size:11px;text-transform:uppercase;letter-spacing:1px;display:block;">Film &amp; Television Industry Alliance</span>
      </span>
    </td>
  </tr>

  <!-- Production Count Banner -->
  <tr>
    <td style="background-color:${BRAND.accent};padding:16px 32px;text-align:center;">
      <p style="color:white;margin:0;font-size:28px;font-weight:700;">Productions this week: <span style="color:#FFD700;">${vars.productionCount || '0'}</span></p>
    </td>
  </tr>

  <!-- Member CTA -->
  <tr>
    <td style="padding:20px 32px;text-align:center;border-bottom:2px solid #eee;">
      <p style="margin:0 0 4px;color:#555;font-size:14px;">Already a member?</p>
      <p style="margin:0;">
        <a href="${vars.digestUrl || 'https://productionlist.com/production-list'}" style="color:${BRAND.accent};font-weight:600;text-decoration:none;font-size:14px;">Click here</a>
        <span style="color:#555;font-size:14px;"> to view or download this Production List</span>
      </p>
    </td>
  </tr>

  <!-- Productions List -->
  <tr>
    <td style="padding:8px 24px 16px;">
      ${vars.productionsHtml || '<p style="color:#999;text-align:center;padding:20px;">No productions available.</p>'}
    </td>
  </tr>

  <!-- CTA Button -->
  <tr>
    <td style="padding:16px 32px 24px;text-align:center;">
      <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
        <tr>
          <td style="background-color:${BRAND.accent};border-radius:6px;">
            <a href="${vars.digestUrl || 'https://productionlist.com/production-list'}" style="display:inline-block;padding:14px 40px;color:white;text-decoration:none;font-weight:700;font-size:15px;">
              View Full Production List
            </a>
          </td>
        </tr>
      </table>
      <p style="color:#888;font-size:12px;margin:12px 0 0;">
        Not a member? <a href="https://productionlist.com/membership-plans" style="color:${BRAND.accent};text-decoration:none;font-weight:600;">See Plans & Pricing</a> — Starting at $38.85/month
      </p>
    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background-color:#f8f8f8;padding:20px 32px;border-top:1px solid #eee;">
      <p style="color:#999;font-size:11px;margin:0;text-align:center;">
        Film &amp; Television Industry Alliance<br/>
        905 N Bethlehem Pk, #44, Spring House, PA 19477<br/>
        <a href="${unsubscribeUrl(vars.recipientEmail)}" style="color:#999;text-decoration:underline;">Unsubscribe</a>
        &nbsp;&middot;&nbsp;
        <a href="https://productionlist.com" style="color:#999;text-decoration:underline;">Visit Website</a>
      </p>
    </td>
  </tr>

</table>
</td></tr>
</table>
</body>
</html>`,
    }),
  },
  {
    slug: 'contact-confirmation',
    name: 'Contact Form Confirmation',
    description: 'Auto-reply confirming receipt of a contact form submission.',
    category: 'notification',
    variables: ['firstName', 'subject'],
    render: (vars) => ({
      subject: 'We received your message — Production List',
      html: wrap(`
        <h2 style="color: ${BRAND.color};">Message Received</h2>
        <p>Hi ${vars.firstName || 'there'},</p>
        <p>Thank you for reaching out. We've received your message${vars.subject ? ` regarding <strong>${vars.subject}</strong>` : ''} and will get back to you within 1-2 business days.</p>
        <p>In the meantime, you can browse our site or check our FAQ:</p>
        <p style="text-align: center; margin: 24px 0;">
          <a href="https://productionlist.com" style="background-color: ${BRAND.accent}; color: white; padding: 12px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
            Visit Production List
          </a>
        </p>
      `),
    }),
  },
]

export function getTemplate(slug: string): EmailTemplate | undefined {
  return emailTemplates.find((t) => t.slug === slug)
}

export interface TemplateOverride {
  slug: string
  subject_override: string | null
  html_override: string | null
  is_active: boolean
  updated_at: string
}

export interface ResolvedTemplate {
  slug: string
  name: string
  description: string
  category: string
  variables: string[]
  subject: string
  html: string
  isActive: boolean
  isCustomized: boolean
}

/**
 * Simple {{variable}} replacement for override templates.
 */
export function replaceVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? '')
}
