import Link from 'next/link'
import { Suspense } from 'react'
import { TrendingSearches } from '@/components/TrendingSearches'

interface PageSidebarProps {
  children?: React.ReactNode
  showTrending?: boolean
  showMemberCTA?: boolean
  isMember?: boolean
}

/**
 * Consistent right sidebar for all pages.
 * Includes contextual widgets + trending searches + member CTA.
 */
export function PageSidebar({
  children,
  showTrending = true,
  showMemberCTA = true,
  isMember = false,
}: PageSidebarProps) {
  return (
    <aside className="lg:w-72 flex-shrink-0 space-y-4">
      {/* Page-specific contextual content */}
      {children}

      {/* Trending Searches widget */}
      {showTrending && (
        <Suspense fallback={<TrendingSkeleton />}>
          <TrendingSearches variant="sidebar" limit={10} />
        </Suspense>
      )}

      {/* Membership CTA */}
      {showMemberCTA && !isMember && (
        <div className="white-bg p-4 text-center">
          <div className="text-2xl mb-2">🎬</div>
          <p className="text-sm text-gray-600 mb-3 leading-relaxed">
            Get full access to contacts, crew details, and all production listings.
          </p>
          <Link href="/membership-plans" className="btn-accent w-full text-center block">
            Join Now
          </Link>
          <p className="text-xs text-gray-400 mt-2">
            Starting at $29.95/month
          </p>
        </div>
      )}
    </aside>
  )
}

function TrendingSkeleton() {
  return (
    <div className="white-bg p-4 animate-pulse">
      <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-2">
            <div className="w-5 h-5 rounded-full bg-gray-100" />
            <div className="h-3 bg-gray-100 rounded flex-1" />
          </div>
        ))}
      </div>
    </div>
  )
}
