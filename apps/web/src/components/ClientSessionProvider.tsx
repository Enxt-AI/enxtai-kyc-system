'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Client Session Provider
 *
 * Provides isolated NextAuth session context for Client Portal.
 * Routes authentication to /api/auth/client/[...nextauth] handler.
 *
 * @remarks
 * **Session Isolation**:
 * - Uses next-auth.client-token cookie (separate from admin)
 * - Allows simultaneous Client + Super Admin logins
 * - Prevents session overwrites in multi-tab scenarios
 *
 * **Authentication Flow**:
 * - signIn() → POST /api/auth/client/callback/credentials
 * - signOut() → POST /api/auth/client/signout
 * - useSession() → GET /api/auth/client/session
 */
export default function ClientSessionProvider({ children }: { children: React.ReactNode }) {
  // ISOLATED CLIENT AUTH: basePath routes to /api/auth/client/[...nextauth]
  // Uses next-auth.client-token cookie (separate from admin portal)
  return (
    <SessionProvider basePath="/api/auth/client">
      {children}
    </SessionProvider>
  );
}