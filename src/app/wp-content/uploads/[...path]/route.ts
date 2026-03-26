import { NextRequest, NextResponse } from 'next/server'

/**
 * Redirect legacy WordPress upload URLs to Supabase Storage.
 * Blog post content contains <img src="/wp-content/uploads/2026/03/image.jpg">
 * which no longer exists on the Next.js site. This route redirects them to
 * the public Supabase Storage bucket where the migrated images live.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> }
) {
  const { path } = await params
  const filePath = path.join('/')

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) {
    return new NextResponse('Storage not configured', { status: 500 })
  }

  const storageUrl = `${supabaseUrl}/storage/v1/object/public/media/${filePath}`

  return NextResponse.redirect(storageUrl, 301)
}
