import { auth } from '@/lib/auth';
import { NextResponse } from 'next/server';

export default auth(function middleware(req) {
  // Build response — NextAuth already handled session; add isolation headers
  const response = NextResponse.next();

  // Enable cross-origin isolation for WebContainers (SharedArrayBuffer)
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');

  void req; // consumed by NextAuth wrapper
  return response;
});

export const config = {
  matcher: ['/session/:path*'],
};
