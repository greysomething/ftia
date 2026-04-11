import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { moveToActiveMember, moveToPastMember } from '@/lib/resend-audiences'

export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes for large syncs

/**
 * POST /api/admin/sync-audiences
 * Syncs Active Members and Past Members audiences in Resend
 * based on current membership status in the database.
 * Streams progress via text/event-stream.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const stream = req.nextUrl.searchParams.get('stream') === '1'

  const supabase = createAdminClient()

  // Fetch all memberships with user profile info (email, name)
  // Use the most recent membership per user
  const { data: memberships, error } = await supabase
    .from('user_memberships')
    .select('user_id, status, user_profiles!inner(email, first_name, last_name)')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ message: 'No memberships found.', synced: 0 })
  }

  // Deduplicate: keep only the most recent membership per user
  const userMap = new Map<string, {
    status: string
    email: string
    firstName: string | null
    lastName: string | null
  }>()

  for (const m of memberships) {
    if (userMap.has(m.user_id)) continue // already have the most recent
    const profile = m.user_profiles as any
    if (!profile?.email) continue

    userMap.set(m.user_id, {
      status: m.status,
      email: profile.email,
      firstName: profile.first_name,
      lastName: profile.last_name,
    })
  }

  const users = [...userMap.values()]
  const activeStatuses = new Set(['active'])
  const pastStatuses = new Set(['cancelled', 'expired', 'suspended'])

  if (stream) {
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        function send(data: string) {
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        }

        send(JSON.stringify({ type: 'start', total: users.length }))

        let activeCount = 0
        let pastCount = 0
        let skipped = 0
        let errors = 0

        for (let i = 0; i < users.length; i++) {
          const user = users[i]

          try {
            if (activeStatuses.has(user.status)) {
              await moveToActiveMember(user.email, user.firstName ?? undefined, user.lastName ?? undefined)
              activeCount++
            } else if (pastStatuses.has(user.status)) {
              await moveToPastMember(user.email, user.firstName ?? undefined, user.lastName ?? undefined)
              pastCount++
            } else {
              skipped++
            }
          } catch (err: any) {
            errors++
            send(JSON.stringify({ type: 'error', email: user.email, message: err.message }))
          }

          // Progress update every 10 users
          if ((i + 1) % 10 === 0 || i === users.length - 1) {
            send(JSON.stringify({
              type: 'progress',
              processed: i + 1,
              total: users.length,
              activeCount,
              pastCount,
              skipped,
              errors,
            }))
          }

          // Rate limit: small delay between Resend API calls
          if ((i + 1) % 5 === 0) {
            await new Promise(r => setTimeout(r, 200))
          }
        }

        send(JSON.stringify({
          type: 'done',
          total: users.length,
          activeCount,
          pastCount,
          skipped,
          errors,
        }))

        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    })
  }

  // Non-streaming mode: process all and return summary
  let activeCount = 0
  let pastCount = 0
  let skipped = 0
  let errors = 0

  for (let i = 0; i < users.length; i++) {
    const user = users[i]

    try {
      if (activeStatuses.has(user.status)) {
        await moveToActiveMember(user.email, user.firstName ?? undefined, user.lastName ?? undefined)
        activeCount++
      } else if (pastStatuses.has(user.status)) {
        await moveToPastMember(user.email, user.firstName ?? undefined, user.lastName ?? undefined)
        pastCount++
      } else {
        skipped++
      }
    } catch {
      errors++
    }

    // Rate limit
    if ((i + 1) % 5 === 0) {
      await new Promise(r => setTimeout(r, 200))
    }
  }

  return NextResponse.json({
    message: 'Audience sync complete.',
    total: users.length,
    activeCount,
    pastCount,
    skipped,
    errors,
  })
}
