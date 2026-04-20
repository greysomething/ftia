/**
 * Prominent status indicator bar shown at the top of edit pages.
 * Shows current visibility/status and last updated date.
 */
export function StatusBar({ visibility, updatedAt, type = 'item' }: {
  visibility?: string
  updatedAt?: string | null
  type?: string
}) {
  const statusConfig: Record<string, { label: string; bg: string; dot: string; text: string }> = {
    publish:      { label: 'Published',    bg: 'bg-green-50 border-green-200',  dot: 'bg-green-500', text: 'text-green-800' },
    draft:        { label: 'Draft',        bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-800' },
    private:      { label: 'Draft',        bg: 'bg-yellow-50 border-yellow-200', dot: 'bg-yellow-500', text: 'text-yellow-800' },
    members_only: { label: 'Members Only', bg: 'bg-blue-50 border-blue-200',    dot: 'bg-blue-500',   text: 'text-blue-800' },
    pending:      { label: 'Pending',      bg: 'bg-orange-50 border-orange-200', dot: 'bg-orange-500', text: 'text-orange-800' },
    trash:        { label: 'Trash',        bg: 'bg-red-50 border-red-200',      dot: 'bg-red-500',    text: 'text-red-800' },
    scheduled:    { label: 'Scheduled',    bg: 'bg-purple-50 border-purple-200', dot: 'bg-purple-500', text: 'text-purple-800' },
  }

  const config = statusConfig[visibility ?? ''] ?? statusConfig.draft

  // Always render in Pacific Time for consistency across the admin panel
  const formattedDate = updatedAt
    ? new Date(updatedAt).toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit',
        timeZone: 'America/Los_Angeles',
      }) + ' PT'
    : null

  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-lg border mb-6 ${config.bg}`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full ${config.dot}`} />
        <span className={`text-sm font-semibold ${config.text}`}>
          {config.label}
        </span>
        <span className={`text-xs ${config.text} opacity-60`}>
          — This {type} is currently {config.label.toLowerCase()}
        </span>
      </div>
      {formattedDate && (
        <span className={`text-xs ${config.text} opacity-70`}>
          Last updated: {formattedDate}
        </span>
      )}
    </div>
  )
}
