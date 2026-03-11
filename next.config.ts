import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
