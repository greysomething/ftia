interface AdminTopBarProps {
  firstName?: string | null
  lastName?: string | null
  email: string
}

export function AdminTopBar({ firstName, lastName, email }: AdminTopBarProps) {
  const name = [firstName, lastName].filter(Boolean).join(' ') || email

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <span>Admin</span>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-sm text-gray-600">{name}</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-accent text-white">
          Admin
        </span>
      </div>
    </header>
  )
}
