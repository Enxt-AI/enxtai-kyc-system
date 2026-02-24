import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * NextAuth Middleware (v4) - Isolated Session Detection
 *
 * Protects client portal and admin panel routes from unauthenticated access.
 * Uses path-based cookie detection to check appropriate isolated session tokens.
 *
 * @remarks
 * **Isolated Authentication Contexts**:
 * - **Super Admin Portal**: Uses `next-auth.super-admin-token` cookie
 * - **Client Portal**: Uses `next-auth.client-token` cookie
 * - **Multi-Tab Safe**: Both can coexist in different browser tabs
 *
 * **Client Portal** (`/client/*`):
 * - `/client/dashboard` - Client dashboard
 * - `/client/submissions` - KYC submissions list
 * - `/client/settings` - User settings
 * - Allowed roles: ADMIN, VIEWER
 * - Redirect: `/client/login` (if unauthenticated)
 *
 * **Admin Panel** (`/admin/*`):
 * - `/admin/dashboard` - Admin dashboard
 * - `/admin/clients` - Client management
 * - `/admin/kyc-review` - KYC review queue
 * - Allowed role: SUPER_ADMIN only
 * - Redirect: `/admin/login` (if unauthenticated)
 *
 * **Public Routes**:
 * - `/admin/login` - Super Admin login (no auth required)
 * - `/client/login` - Client Admin login (no auth required)
 * - `/` - Public landing page (no auth required, handled by page component)
 * - `/kyc/*` - Public KYC submission flow (no auth required)
 *
 * **Behavior**:
 * - Authenticated users: Allow access to protected routes
 * - Unauthenticated users: Redirect to appropriate login page
 * - Login pages accessible without authentication
 *
 * **How It Works**:
 * 1. Middleware intercepts /client/* and /admin/* requests
 * 2. Checks appropriate isolated session cookie based on path using getToken()
 * 3. If no valid token, redirect to appropriate login page
 * 4. If token exists, allow request to proceed (role check done by guard components)
 *
 * **Note on Root `/` Redirect**:
 * - Middleware does NOT handle root `/` redirect
 * - Root page component (`app/page.tsx`) handles authenticated user redirect
 * - This separation keeps middleware focused on authentication checks only
 *
 * **RBAC Strategy**:
 * - Middleware only checks authentication (token presence)
 * - Role-based authorization handled by guard components:
 *   - ClientRoleGuard: Blocks SUPER_ADMIN from /client/*
 *   - SuperAdminGuard: Blocks ADMIN/VIEWER from /admin/*
 *
 * **Session Validation**:
 * - NextAuth checks JWT token validity using getToken() with specified cookie names
 * - Automatic token refresh if expired but within grace period
 * - Invalid/missing token triggers redirect
 *
 * @see {@link https://next-auth.js.org/configuration/nextjs#middleware NextAuth Middleware Documentation}
 */
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow login pages
  if (pathname === '/admin/login' || pathname === '/client/login') {
    return NextResponse.next();
  }

  // Admin paths → next-auth.super-admin-token
  if (pathname.startsWith('/admin')) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: 'next-auth.super-admin-token'
    });

    if (!token) {
      // Check if they have a client token instead
      const clientToken = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
        cookieName: 'next-auth.client-token'
      });

      if (clientToken) {
        // Logged in as Client Admin but trying to access Super Admin panel
        const clientDashboardUrl = new URL('/client/dashboard', req.url);
        return NextResponse.redirect(clientDashboardUrl, { headers: { 'x-middleware-replace': 'true' } });
      }

      const loginUrl = new URL('/admin/login', req.url);
      return NextResponse.redirect(loginUrl, { headers: { 'x-middleware-replace': 'true' } });
    }
  }

  // Client paths → next-auth.client-token
  if (pathname.startsWith('/client')) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET,
      cookieName: 'next-auth.client-token'
    });

    if (!token) {
      // Check if they have a super admin token instead
      const adminToken = await getToken({
        req,
        secret: process.env.NEXTAUTH_SECRET,
        cookieName: 'next-auth.super-admin-token'
      });

      if (adminToken) {
        // Logged in as Super Admin but trying to access Client Portal
        const adminDashboardUrl = new URL('/admin', req.url);
        return NextResponse.redirect(adminDashboardUrl, { headers: { 'x-middleware-replace': 'true' } });
      }

      const loginUrl = new URL('/client/login', req.url);
      return NextResponse.redirect(loginUrl, { headers: { 'x-middleware-replace': 'true' } });
    }
  }

  return NextResponse.next();
}

/**
 * Middleware Configuration
 *
 * Specifies which routes the middleware should run on.
 *
 * @remarks
 * **Matcher Patterns**:
 * - `/client/:path*` - All client portal routes
 * - `/admin/:path*` - All admin panel routes
 *
 * **Rationale**:
 * - Only protected routes require authentication checks
 * - Avoids unnecessary token lookups on public routes (/, /kyc/*, /api/*)
 * - Improves performance by limiting middleware execution scope
 *
 * **Note**:
 * The middleware function itself handles login page exceptions
 * (/admin/login, /client/login) allowing unauthenticated access.
 *
 * **Performance**:
 * Middleware only runs on matched routes (efficient).
 */
export const config = {
  matcher: ['/client/:path*', '/admin/:path*'],
};
