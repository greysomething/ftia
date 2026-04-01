/**
 * POST /api/admin/backfill-subscribers
 *
 * One-time migration: fetches all contacts from Resend audiences and
 * upserts them into the newsletter_subscribers table in Supabase.
 * Supports streaming progress via ?stream=true.
 *
 * This is needed because the digest sender was previously fetching 22K+
 * contacts from Resend's paginated API (100/page), which was slow and
 * unreliable. Now subscribers are stored locally in Supabase.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'
import { getAdminUser } from '@/lib/auth'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const user = await getAdminUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const { searchParams } = new URL(req.url)
  const isStream = searchParams.get('stream') === 'true'

  const resendApiKey = process.env.RESEND_API_KEY!
  const audienceIds: Record<string, string> = {
    general: process.env.RESEND_AUDIENCE_ID ?? '',
    active_members: process.env.RESEND_AUDIENCE_MEMBERS_ID ?? '',
    past_members: process.env.RESEND_AUDIENCE_PAST_MEMBERS_ID ?? '',
  }

  async function run(emit: (event: Record<string, any>) => void) {
    let totalImported = 0
    let totalSkipped = 0

    for (const [name, audienceId] of Object.entries(audienceIds)) {
      if (!audienceId) continue

      emit({ phase: 'audience', audience: name, message: `Fetching "${name}" audience...` })

      let hasMore = true
      let afterCursor: string | undefined
      let pageCount = 0
      let audienceContacts: Array<{ email: string; first_name?: string; last_name?: string; unsubscribed?: boolean }> = []

      while (hasMore) {
        const url = new URL(`https://api.resend.com/audiences/${audienceId}/contacts`)
        url.searchParams.set('limit', '100')
        if (afterCursor) url.searchParams.set('after', afterCursor)

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${resendApiKey}` },
        })

        if (!res.ok) {
          emit({ phase: 'warning', message: `Resend API error for "${name}": ${res.status}` })
          break
        }

        const data = await res.json()
        const contacts = data.data ?? []
        pageCount++

        if (!Array.isArray(contacts) || contacts.length === 0) break

        for (const c of contacts) {
          if (c.email) {
            audienceContacts.push({
              email: c.email.toLowerCase(),
              first_name: c.first_name || null,
              last_name: c.last_name || null,
              unsubscribed: c.unsubscribed === true,
            })
          }
        }

        emit({
          phase: 'fetching',
          audience: name,
          page: pageCount,
          contactsSoFar: audienceContacts.length,
        })

        hasMore = data.has_more === true
        if (hasMore && contacts.length > 0) {
          afterCursor = contacts[contacts.length - 1].id
        } else {
          hasMore = false
        }

        // Small delay to avoid rate limits
        await new Promise(r => setTimeout(r, 100))
      }

      emit({
        phase: 'importing',
        audience: name,
        total: audienceContacts.length,
        message: `Importing ${audienceContacts.length} contacts from "${name}"...`,
      })

      // Upsert in batches of 500
      const BATCH = 500
      for (let i = 0; i < audienceContacts.length; i += BATCH) {
        const batch = audienceContacts.slice(i, i + BATCH).map(c => ({
          email: c.email,
          first_name: c.first_name,
          last_name: c.last_name,
          unsubscribed: c.unsubscribed ?? false,
          source: 'backfill',
          updated_at: new Date().toISOString(),
        }))

        const { error } = await supabase
          .from('newsletter_subscribers')
          .upsert(batch, { onConflict: 'email', ignoreDuplicates: false })

        if (error) {
          emit({ phase: 'warning', message: `Upsert error: ${error.message}` })
          totalSkipped += batch.length
        } else {
          totalImported += batch.length
        }

        emit({
          phase: 'progress',
          audience: name,
          imported: totalImported,
          skipped: totalSkipped,
          processed: Math.min(i + BATCH, audienceContacts.length),
          total: audienceContacts.length,
        })
      }
    }

    const result = {
      phase: 'done',
      success: true,
      message: `Backfill complete: ${totalImported} contacts imported, ${totalSkipped} skipped.`,
      imported: totalImported,
      skipped: totalSkipped,
    }
    emit(result)
    return result
  }

  if (isStream) {
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        function emit(event: Record<string, any>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
        }
        try {
          await run(emit)
        } catch (err: any) {
          emit({ phase: 'error', error: err.message })
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
    })
  }

  let finalResult: any = null
  await run((event) => { if (event.phase === 'done') finalResult = event })
  return NextResponse.json(finalResult ?? { error: 'Unexpected error' })
}
