import { NextRequest, NextResponse } from 'next/server'
import { unsubscribeFromAll } from '@/lib/resend-audiences'

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 })
    }

    const results = await unsubscribeFromAll(email.toLowerCase().trim())

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
