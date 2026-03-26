import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/server'

export const revalidate = 300 // cache for 5 minutes

export async function GET() {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('network_logos')
    .select('id, name, image_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json([], { status: 200 })
  return NextResponse.json(data ?? [])
}
