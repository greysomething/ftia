interface StatCardProps {
  label: string
  value: number | string
  icon: React.ReactNode
  accent?: boolean
}

export function StatCard({ label, value, icon, accent }: StatCardProps) {
  return (
    <div className={`admin-card flex items-center gap-4 ${accent ? 'border-accent' : ''}`}>
      <div className={`p-3 rounded-lg flex-shrink-0 ${accent ? 'bg-accent/10 text-accent' : 'bg-gray-100 text-gray-600'}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p className="text-sm text-gray-500 mt-0.5">{label}</p>
      </div>
    </div>
  )
}
