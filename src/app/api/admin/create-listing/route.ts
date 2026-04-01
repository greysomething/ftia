import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/server'
import { slugify } from '@/lib/utils'

/**
 * POST /api/admin/create-listing
 * Creates a new crew_member or company record from inline production data.
 * Returns the new record's id so the caller can link it.
 */
export async function POST(req: NextRequest) {
  try {
    await requireAdmin()
    const supabase = createAdminClient()
    const body = await req.json()
    const { type } = body as { type: 'crew' | 'company' }

    if (type === 'crew') {
      const { name, phones, emails, linkedin, twitter, instagram, website, role_name } = body
      if (!name?.trim()) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      }

      // Generate unique slug
      let slug = slugify(name.trim())
      const { data: existing } = await supabase
        .from('crew_members')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (existing) {
        slug = `${slug}-${Date.now()}`
      }

      const { data, error } = await supabase.from('crew_members').insert({
        name: name.trim(),
        slug,
        emails: emails?.filter(Boolean) ?? [],
        phones: phones?.filter(Boolean) ?? [],
        linkedin: linkedin?.trim() || null,
        twitter: twitter?.trim() || null,
        instagram: instagram?.trim() || null,
        website: website?.trim() || null,
        roles: role_name ? [role_name.trim()] : [],
        known_for: [],
        visibility: 'publish',
      }).select('id, name, slug').single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ id: data.id, title: data.name, slug: data.slug, type: 'crew' })
    }

    if (type === 'company') {
      const { name, address, phones, faxes, emails, linkedin, twitter, instagram, website } = body
      if (!name?.trim()) {
        return NextResponse.json({ error: 'Name is required' }, { status: 400 })
      }

      let slug = slugify(name.trim())
      const { data: existing } = await supabase
        .from('companies')
        .select('id')
        .eq('slug', slug)
        .maybeSingle()
      if (existing) {
        slug = `${slug}-${Date.now()}`
      }

      const { data, error } = await supabase.from('companies').insert({
        title: name.trim(),
        slug,
        addresses: address?.trim() ? [address.trim()] : [],
        phones: phones?.filter(Boolean) ?? [],
        faxes: faxes?.filter(Boolean) ?? [],
        emails: emails?.filter(Boolean) ?? [],
        linkedin: linkedin?.trim() || null,
        twitter: twitter?.trim() || null,
        instagram: instagram?.trim() || null,
        website: website?.trim() || null,
        visibility: 'publish',
      }).select('id, title, slug').single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ id: data.id, title: data.title, slug: data.slug, type: 'company' })
    }

    return NextResponse.json({ error: 'Invalid type. Must be "crew" or "company".' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Unauthorized' }, { status: 401 })
  }
}
