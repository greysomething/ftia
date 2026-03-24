import { NextRequest, NextResponse } from 'next/server'
import { getProductionsForWeek, getWeeklyStats } from '@/lib/queries'

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date) {
    return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 })
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
