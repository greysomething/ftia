import { redirect } from 'next/navigation'

/** GET /weekly → redirect to the current week's production list */
export async function GET() {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  const mondayStr = monday.toISOString().split('T')[0]

  redirect(`/productions/week/${mondayStr}`)
}
