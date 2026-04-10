import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip API routes entirely — webhooks (Stripe) and other API endpoints
  // must not be processed by auth middleware (avoids 307 redirects)
  if (pathname.startsWith('/api/')) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Redirect logged-in users from home to productions (WordPress Redirection plugin rule)
  if (pathname === '/' && user) {
    return NextResponse.redirect(new URL('/productions', request.url))
  }

  // Auth routes: redirect authenticated users away from login/register
  if (user && (pathname === '/login' || pathname === '/register')) {
    return NextResponse.redirect(new URL('/productions', request.url))
  }

  // Protected routes: require authentication
  const protectedPaths = [
    '/productions',
    '/membership-account',
    '/submit-production',
    '/welcome',
    '/admin',
    '/do-not-work',
  ]

  // Allow public access to weekly production list pages (content is member-gated on the page)
  const publicExceptions = ['/productions/week/', '/weekly']
  const isPublicException = publicExceptions.some((p) => pathname.startsWith(p))

  const isProtected = protectedPaths.some((p) => pathname.startsWith(p))

  if (isProtected && !isPublicException && !user) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('redirect', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|api/|images/).*)',
  ],
}
