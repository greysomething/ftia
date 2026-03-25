import { NextRequest, NextResponse } from 'next/server'
import { getUser, isMember } from '@/lib/auth'
import { getProductionsForWeek, getWeeklyStats } from '@/lib/queries'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) {
    return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
  }

  // Require active membership to access full report data
  const user = await getUser()
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }
  const member = await isMember(user.id)
  if (!member) {
    return NextResponse.json({ error: 'Active membership required' }, { status: 403 })
  }

  // Calculate previous Monday for delta
  const monday = new Date(date + 'T00:00:00')
  const prevMonday = new Date(monday)
  prevMonday.setDate(monday.getDate() - 7)
  const prevMondayStr = prevMonday.toISOString().split('T')[0]

  const [productions, stats] = await Promise.all([
    getProductionsForWeek(date),
    getWeeklyStats(date, prevMondayStr),
  ])

  return NextResponse.json({ productions, stats })
}
