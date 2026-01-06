import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

/**
 * NextAuth.js Route Handler (v4)
 * 
 * API route handler for NextAuth.js authentication.
 * 
 * @remarks
 * **Purpose**:
 * - Handles all NextAuth.js authentication requests
 * - Mounted at /api/auth/* (catch-all route)
 * - Provides signin, signout, callback, session endpoints
 * 
 * **Endpoints Handled**:
 * - GET /api/auth/signin - Sign in page (redirects to custom page)
 * - POST /api/auth/signin - Process sign in
 * - GET /api/auth/signout - Sign out page
 * - POST /api/auth/signout - Process sign out
 * - GET /api/auth/session - Get current session
 * - GET /api/auth/csrf - Get CSRF token
 * - GET /api/auth/callback/* - OAuth callbacks
 * 
 * **Usage**:
 * NextAuth automatically routes requests to appropriate handlers.
 * No manual routing required.
 * 
 * @see {@link https://next-auth.js.org/configuration/initialization#route-handlers NextAuth Route Handlers}
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
