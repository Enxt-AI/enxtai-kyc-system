import { SessionProvider } from 'next-auth/react';

/**
 * Admin Session Provider
 *
 * Provides NextAuth session context for the Super Admin portal.
 * Routes authentication to /api/auth/admin/[...nextauth] handler.
 *
 * @remarks
 * **Session Isolation**:
 * - Admin sessions use `next-auth.super-admin-token` cookie
 * - Client sessions use `next-auth.client-token` cookie
 * - Allows simultaneous Super Admin + Client Admin logins in different tabs
 *
 * **Authentication Flow**:
 * - signIn() → POST /api/auth/admin/callback/credentials
 * - signOut() → POST /api/auth/admin/signout
 * - useSession() → GET /api/auth/admin/session
 *
 * **Usage**:
 * ```tsx
 * <AdminSessionProvider>
 *   <YourComponents />
 * </AdminSessionProvider>
 * ```
 *
 * @param children - React components that need session access
 */
export default function AdminSessionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // ISOLATED ADMIN AUTH: basePath routes to /api/auth/admin/[...nextauth]
  // Uses next-auth.super-admin-token cookie (separate from client portal)
  // Enables simultaneous Super Admin + Client Admin logins in different tabs
  return <SessionProvider basePath="/api/auth/admin">{children}</SessionProvider>;
}