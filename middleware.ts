import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Middleware: protect /session/* pages AND /api/* routes (except /api/auth/*).
 * Pages get redirected to /login.
 * API routes get a 401 JSON response so fetch callers don't receive HTML.
 *
 * NOTE: We intentionally avoid using the NextAuth `auth()` wrapper here.
 * The `auth()` function from NextAuth v5 is incompatible with the OpenNext
 * Cloudflare Edge middleware runtime — Turbopack bundles the lazy-init
 * callback eagerly and the resulting module fails to export a callable
 * `middleware` function, producing:
 *   "The Middleware file must export a function named `middleware`"
 *
 * Instead we check for the NextAuth session cookie directly. This is a
 * lightweight gate — actual session validation still happens server-side
 * when API routes call `auth()`.
 */
export function middleware(request: NextRequest) {
  // NextAuth v5 session cookie names (checks both secure and non-secure variants)
  const hasSession =
    request.cookies.has('authjs.session-token') ||
    request.cookies.has('__Secure-authjs.session-token');

  if (!hasSession) {
    // For API routes, return 401 JSON instead of redirecting
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For pages, redirect to login
    const loginUrl = new URL('/login', request.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/session/:path*',
    // SEC-05: Exclude auth, webhooks, and health from middleware auth gate
    '/api/((?!auth|slack|github/webhook|health).)*',
  ],
};
