import { MetadataRoute } from 'next'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://productionlist.com'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/productions',
          '/membership-account/',
          '/api/',
          '/my-account',
          '/welcome',
          '/thank-you',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
