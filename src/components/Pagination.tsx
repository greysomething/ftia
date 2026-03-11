import Link from 'next/link'
import { getPaginationRange } from '@/lib/utils'

interface PaginationProps {
  current: number
  total: number
  perPage: number
  basePath: string   // e.g. "/productions" or "/blog"
}

export function Pagination({ current, total, perPage, basePath }: PaginationProps) {
  const { range, totalPages } = getPaginationRange(current, total, perPage)
  if (totalPages <= 1) return null

  function href(page: number) {
    if (page === 1) return basePath
    return `${basePath}/page/${page}`
  }

  return (
    <nav className="flex items-center justify-center gap-1 mt-8" aria-label="Pagination">
      {current > 1 && (
        <Link href={href(current - 1)} className="pagination-link" aria-label="Previous">
          ‹
        </Link>
      )}
      {range.map((page, i) =>
        page === -1 ? (
          <span key={`ellipsis-${i}`} className="px-1 text-gray-400">
            …
          </span>
        ) : (
          <Link
            key={page}
            href={href(page)}
            className={`pagination-link ${page === current ? 'pagination-link-active' : ''}`}
            aria-current={page === current ? 'page' : undefined}
          >
            {page}
          </Link>
        )
      )}
      {current < totalPages && (
        <Link href={href(current + 1)} className="pagination-link" aria-label="Next">
          ›
        </Link>
      )}
    </nav>
  )
}
