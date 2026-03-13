import { NextRequest, NextResponse } from 'next/server'
import { getAdminUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const admin = await getAdminUser()
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { mode } = await req.json() // 'member' | 'visitor'

  const response = NextResponse.json({ mode })

  if (mode === 'visitor') {
    response.cookies.set('admin_view_as', 'visitor', {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24, // 24 hours
    })
  } else {
    // Clear the cookie to restore default admin=member access
    response.cookies.delete('admin_view_as')
  }

  return response
}
