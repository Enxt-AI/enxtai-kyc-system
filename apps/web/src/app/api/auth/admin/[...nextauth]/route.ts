/**
 * NextAuth v4 API Route Handler - Super Admin Portal
 *
 * Handles all authentication requests for Super Admin:
 * - POST /api/auth/admin/signin - Login
 * - POST /api/auth/admin/signout - Logout
 * - GET /api/auth/admin/session - Get session
 * - GET /api/auth/admin/csrf - CSRF token
 *
 * Uses isolated cookie: next-auth.super-admin-token
 *
 * @see {@link https://next-auth.js.org/configuration/initialization#route-handlers-app NextAuth v4 App Router}
 */
import NextAuth from 'next-auth';
import { authAdminOptions } from '@/lib/auth-admin';

// Create handler from options
const handler = NextAuth(authAdminOptions);

// Export as GET and POST for Next.js App Router
export { handler as GET, handler as POST };