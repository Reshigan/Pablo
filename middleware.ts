import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

/**
 * Middleware: protect /session/* pages AND /api/* routes (except /api/auth/*).
 * Pages get the default NextAuth redirect-to-login behaviour.
 * API routes get a 401 JSON response so fetch callers don't receive HTML.
 */
export default auth((req) => {
  if (!req.auth) {
    // For API routes, return 401 JSON instead of redirecting
    if (req.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // For pages, redirect to login
    const loginUrl = new URL('/login', req.nextUrl.origin);
    loginUrl.searchParams.set('callbackUrl', req.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    '/session/:path*',
    '/api/((?!auth).)*',
  ],
};
