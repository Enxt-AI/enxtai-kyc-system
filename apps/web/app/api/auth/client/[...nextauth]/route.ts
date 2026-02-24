/**
 * NextAuth v4 API Route Handler - Client Portal
 *
 * Handles all authentication requests for Client Portal:
 * - POST /api/auth/client/signin - Login
 * - POST /api/auth/client/signout - Logout
 * - GET /api/auth/client/session - Get session
 * - GET /api/auth/client/csrf - CSRF token
 *
 * Uses isolated cookie: next-auth.client-token
 *
 * @see {@link https://next-auth.js.org/configuration/initialization#route-handlers-app NextAuth v4 App Router}
 */
import NextAuth from 'next-auth';
import { authClientOptions } from '@/lib/auth-client';

// Create handler from options
const handler = NextAuth(authClientOptions);

// Export as GET and POST for Next.js App Router
export { handler as GET, handler as POST };