import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { getAdminProductionById } from '@/lib/admin-queries'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/get-production?id=123
 * Returns full production data with relations for compare/update flows.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAdmin()
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id || isNaN(Number(id))) {
    return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 })
  }

  try {
    const production = await getAdminProductionById(Number(id))
    return NextResponse.json({ production })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Not found' }, { status: 404 })
  }
}
