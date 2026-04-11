import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { moveToActiveMember, moveToPastMember } from '@/lib/resend-audiences'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

/**
 * POST /api/admin/sync-audiences
 * Syncs Active Members and Past Members audiences in Resend
 * based on current membership status in the database.
 * Always streams progress.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  // Step 1: Fetch all memberships (no join — avoids PostgREST FK issues)
  const allMemberships: Array<{ user_id: string; status: string; created_at: string }>  = []
  let page = 0
  while (true) {
    const from = page * 1000
    const { data, error } = await supabase
      .from('user_memberships')
      .select('user_id, status, created_at')
      .order('created_at', { ascending: false })
      .range(from, from + 999)
    if (error) {
      return NextResponse.json({ error: `Memberships query failed: ${error.message}` }, { status: 500 })
    }
    if (!data || data.length === 0) break
    allMemberships.push(...data)
    if (data.length < 1000) break
    page++
  }

  if (allMemberships.length === 0) {
    return NextResponse.json({ message: 'No memberships found.', synced: 0 })
  }

  // Deduplicate: keep only the most recent membership per user
  const userStatusMap = new Map<string, string>()
  for (const m of allMemberships) {
    if (!userStatusMap.has(m.user_id)) {
      userStatusMap.set(m.user_id, m.status)
    }
  }

  // Step 2: Fetch profiles for these users (in batches)
  const userIds = [...userStatusMap.keys()]
  const profileMap = new Map<string, { email: string; first_name: string | null; last_name: string | null }>()

  for (let i = 0; i < userIds.length; i += 100) {
    const batch = userIds.slice(i, i + 100)
    const { data: profiles } = await supabase
      .from('user_profiles')
      .select('id, email, first_name, last_name')
      .in('id', batch)

    for (const p of profiles ?? []) {
      if (p.email) {
        profileMap.set(p.id, { email: p.email, first_name: p.first_name, last_name: p.last_name })
      }
    }
  }

  // Step 3: Build the user list to sync
  const users: Array<{ email: string; firstName?: string; lastName?: string; status: string }> = []
  for (const [userId, status] of userStatusMap) {
    const profile = profileMap.get(userId)
    if (!profile) continue
    users.push({
      email: profile.email,
      firstName: profile.first_name ?? undefined,
      lastName: profile.last_name ?? undefined,
      status,
    })
  }

  const activeStatuses = new Set(['active'])
  const pastStatuses = new Set(['cancelled', 'expired', 'suspended'])

  // Step 4: Stream progress while syncing
  const encoder = new TextEncoder()
  const readable = new ReadableStream({
    async start(controller) {
      function send(data: string) {
        try { controller.enqueue(encoder.encode(`data: ${data}\n\n`)) } catch { /* closed */ }
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
            await moveToActiveMember(user.email, user.firstName, user.lastName)
            activeCount++
          } else if (pastStatuses.has(user.status)) {
            await moveToPastMember(user.email, user.firstName, user.lastName)
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

        // Rate limit: small delay every 5 contacts
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
