import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * NextAuth Middleware (v4)
 *
 * Protects client portal routes from unauthenticated access.
 *
 * @remarks
 * **Protected Routes**:
 * - `/client/dashboard` - Client dashboard
 * - `/client/submissions` - KYC submissions list
 * - `/client/settings` - User settings
 * - All other `/client/*` routes except `/client/login`
 *
 * **Behavior**:
 * - Authenticated users: Allow access to protected routes
 * - Unauthenticated users: Redirect to `/client/login`
 * - Login page accessible without authentication
 *
 * **How it Works**:
 * 1. Middleware intercepts all /client/* requests
 * 2. Checks if user has valid JWT token
 * 3. If no token and not on login page, redirect to login
 * 4. If token exists, allow request to proceed
 *
 * **Session Validation**:
 * - NextAuth checks JWT token validity
 * - Automatic token refresh if expired but within grace period
 * - Invalid/missing token triggers redirect
 *
 * @see {@link https://next-auth.js.org/configuration/nextjs#middleware NextAuth Middleware Documentation}
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow access to login page without authentication
  if (pathname === '/client/login') {
    return NextResponse.next();
  }

  // Check if user has valid JWT token
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });

  // Protect all /client/* routes (except login)
  if (pathname.startsWith('/client') && !token) {
    // Redirect to login page
    const loginUrl = new URL('/client/login', req.url);
    return NextResponse.redirect(loginUrl);
  }

  // Allow request to proceed
  return NextResponse.next();
}

/**
 * Middleware Configuration
 *
 * Specifies which routes the middleware should run on.
 *
 * @remarks
 * **Matcher Pattern**:
 * - `/client/:path*` - All routes under /client (including login)
 *
 * **Rationale**:
 * - Only client portal routes require authentication checks
 * - Avoids unnecessary token lookups on public routes (/, /kyc/*, /admin/*)
 * - Improves performance by limiting middleware execution scope
 *
 * **Note**:
 * The middleware function itself handles the /client/login exception,
 * allowing unauthenticated access to the login page.
 *
 * **Performance**:
 * Middleware only runs on matched routes (efficient).
 */
export const config = {
  matcher: '/client/:path*',
};
