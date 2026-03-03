import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth(function middleware(req) {
  // Redirect unauthenticated users to login
  if (!req.auth) {
    return NextResponse.redirect(new URL('/login', req.nextUrl.origin));
  }

  // Build response — NextAuth already handled session; add isolation headers
  const response = NextResponse.next();

  // Enable cross-origin isolation for WebContainers (SharedArrayBuffer)
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  return response;
});

export const config = {
  matcher: ['/session/:path*'],
};
