import { requireAdmin } from '@/lib/auth'
import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { AdminTopBar } from '@/components/admin/AdminTopBar'

export const metadata = {
  title: { template: '%s | Production List Admin', default: 'Admin Dashboard' },
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await requireAdmin()

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar />

      <div className="flex-1 flex flex-col min-w-0">
        <AdminTopBar
          firstName={profile.first_name}
          lastName={profile.last_name}
          email={user.email ?? ''}
        />
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}
