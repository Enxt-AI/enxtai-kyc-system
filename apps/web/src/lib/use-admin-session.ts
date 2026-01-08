import { useSession as useNextAuthSession } from 'next-auth/react';

/**
 * Admin Session Hook
 *
 * Custom hook for accessing Super Admin authentication session.
 *
 * @remarks
 * **CRITICAL: Only works within AdminSessionProvider context**
 * - Must be wrapped by <AdminSessionProvider> in component tree
 * - Reads next-auth.super-admin-token cookie (isolated from client)
 * - Returns same data structure as useSession() but from admin context
 *
 * **Cookie Isolation**:
 * - Admin: next-auth.super-admin-token (via /api/auth/admin)
 * - Client: next-auth.client-token (via /api/auth/client)
 * - Separate cookies enable multi-tab simultaneous logins
 *
 * **Usage**:
 * ```typescript
 * // ✅ CORRECT: Within AdminSessionProvider
 * <AdminSessionProvider>
 *   <MyComponent />  // useAdminSession() works here
 * </AdminSessionProvider>
 *
 * // ❌ WRONG: Outside AdminSessionProvider
 * <MyComponent />  // useAdminSession() returns null/undefined
 * ```
 *
 * **Multi-Tab Behavior**:
 * - Tab 1: Admin login → next-auth.super-admin-token set
 * - Tab 2: Client login → next-auth.client-token set
 * - Both tabs maintain independent sessions (no overwrites)
 *
 * **Session Structure**:
 * ```typescript
 * {
 *   user: {
 *     id: string;
 *     email: string;
 *     clientId: null;      // Always null for Super Admins
 *     role: 'SUPER_ADMIN';
 *     portal: 'admin';
 *   }
 * }
 * ```
 *
 * **Context-Aware Behavior**:
 * - AdminSessionProvider sets basePath="/api/auth/admin"
 * - This causes useSession() to read next-auth.super-admin-token cookie
 * - Without AdminSessionProvider, hook returns unauthenticated state
 *
 * @returns NextAuth session data for admin authentication
 */
export function useAdminSession() {
  // CONTEXT-AWARE: useSession() behavior depends on SessionProvider basePath
  // AdminSessionProvider sets basePath="/api/auth/admin"
  // This causes useSession() to read next-auth.super-admin-token cookie
  return useNextAuthSession();
}