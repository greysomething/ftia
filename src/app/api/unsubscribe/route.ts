import { NextRequest, NextResponse } from 'next/server'
import { unsubscribeFromAll } from '@/lib/resend-audiences'
import { createAdminClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()
    const results = await unsubscribeFromAll(normalizedEmail)

    // Also mark as unsubscribed in Supabase
    const supabase = createAdminClient()
    await supabase.from('newsletter_subscribers')
      .update({ unsubscribed: true, updated_at: new Date().toISOString() })
      .eq('email', normalizedEmail)
      .catch(() => {})

    return NextResponse.json({
      success: true,
      message: `Successfully unsubscribed ${email} from ${results.length} audience(s).`,
    })
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to process unsubscribe request' },
      { status: 500 }
    )
  }
}
