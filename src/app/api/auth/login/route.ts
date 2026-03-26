import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { logActivity } from '@/lib/activity-log'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()

    // Verify credentials using admin API (list users + verify password)
    // We use signInWithPassword via a temporary client approach
    const { createClient } = await import('@supabase/supabase-js')
    const tempClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error: authError } = await tempClient.auth.signInWithPassword({
      email,
      password,
    })

    if (authError || !data.user) {
      // Log failed attempt
      void logActivity({
        email,
        eventType: 'login_failed',
        metadata: { reason: authError?.message ?? 'Unknown error' },
        reqHeaders: req.headers,
      })

      return NextResponse.json(
        { error: authError?.message ?? 'Invalid credentials' },
        { status: 401 }
      )
    }

    // Log successful login (fire-and-forget)
    void logActivity({
      userId: data.user.id,
      email: data.user.email,
      eventType: 'login',
      reqHeaders: req.headers,
    })

    // Return the session tokens so the client can set them
    return NextResponse.json({
      success: true,
      session: {
        access_token: data.session!.access_token,
        refresh_token: data.session!.refresh_token,
      },
    })
  } catch (err: any) {
    console.error('[login] Unexpected error:', err)
    return NextResponse.json(
      { error: 'An unexpected error occurred.' },
      { status: 500 }
    )
  }
}
