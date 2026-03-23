import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  typescript: {
    // TODO: Fix Supabase relational query type inference across the codebase
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: 'productionlist.com',
      },
      {
        protocol: 'https',
        hostname: 'productionlist-wp-local.local',
      },
    ],
  },
  // Preserve exact WP permalink structure
  async redirects() {
    return [
      // WordPress feed URLs
      {
        source: '/feed',
        destination: '/api/feed',
        permanent: false,
      },
      {
        source: '/feed/',
        destination: '/api/feed',
        permanent: false,
      },
    ]
  },
}

export default nextConfig
