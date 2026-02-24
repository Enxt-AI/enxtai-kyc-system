'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * ClientRoleGuard Component
 *
 * Authorization guard that prevents SUPER_ADMIN from accessing client portal
 * and enforces forced password reset for newly onboarded clients.
 *
 * @remarks
 * **IMPORTANT: Must be used within ClientSessionProvider context**
 * - Relies on ClientSessionProvider's basePath="/api/auth/client"
 * - Checks next-auth.client-token cookie (isolated from admin)
 * - useSession() automatically uses client session context
 *
 * **Multi-Tab Isolation**:
 * - Admin sessions: next-auth.super-admin-token
 * - Client sessions: next-auth.client-token
 * - Both can coexist in different tabs without conflicts
 *
 * **Purpose**:
 * - Enforces role-based access control for tenant-specific pages
 * - SUPER_ADMIN users have `clientId=null` and cannot access tenant-scoped APIs
 * - Redirects SUPER_ADMIN to their proper admin dashboard
 * - Forces password reset for clients with `mustChangePassword=true`
 *
 * **RBAC Strategy**:
 * - Allowed Roles: ADMIN, VIEWER (tenant users)
 * - Blocked Role: SUPER_ADMIN (platform administrator)
 * - Redirect: SUPER_ADMIN → `/admin`
 * - Forced Reset: mustChangePassword=true → `/client/change-password`
 *
 * **Security Rationale**:
 * SUPER_ADMIN users manage multiple clients and should not access single-tenant
 * portals. Their `clientId=null` would cause API errors on tenant-scoped endpoints
 * like `/api/v1/client/stats` which require a valid clientId.
 *
 * Newly onboarded clients must change their temporary password before accessing
 * the portal to ensure security compliance.
 *
 * **Usage**:
 * ```tsx
 * // ✅ CORRECT: Within ClientSessionProvider
 * <ClientSessionProvider>
 *   <ClientRoleGuard>
 *     <YourClientPortalContent />
 *   </ClientRoleGuard>
 * </ClientSessionProvider>
 *
 * // ❌ WRONG: Outside ClientSessionProvider
 * <ClientRoleGuard>
 *   <YourClientPortalContent />
 * </ClientRoleGuard>  // Will not work properly
 * ```
 *
 * **Usage**:
 * ```tsx
 * // ✅ CORRECT: Within ClientSessionProvider
 * <ClientSessionProvider>
 *   <ClientRoleGuard>
 *     <YourClientPortalContent />
 *   </ClientRoleGuard>
 * </ClientSessionProvider>
 *
 * // ❌ WRONG: Outside ClientSessionProvider
 * <ClientRoleGuard>
 *   <YourClientPortalContent />
 * </ClientRoleGuard>  // Will not work properly
 * ```
 *
 * **Redirect Flow**:
 * - Unauthenticated detected → Redirect to `/client/login`
 * - SUPER_ADMIN detected → Redirect to `/admin`
 * - mustChangePassword=true detected → Redirect to `/client/change-password`
 * - ADMIN/VIEWER → Allow access (render children)
 * - Loading state shown during authentication and role checks
 *
 * **Session Structure**:
 * Expects NextAuth session with:
 * ```typescript
 * session.user.role: 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER'
 * session.user.clientId: string | null
 * session.user.mustChangePassword: boolean
 * ```
 *
 * @param props.children - React children to render if role check passes
 */
export default function ClientRoleGuard({ children }: { children: React.ReactNode }) {
  // ISOLATED CLIENT SESSION: useSession() reads next-auth.client-token
  // via ClientSessionProvider basePath="/api/auth/client"
  const { data: session, status } = useSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') return;

    // LOGOUT CLEANUP: Clear password reset flag on logout
    // Prevents stale flags from affecting future login sessions
    if (status === 'unauthenticated') {
      localStorage.removeItem('passwordResetComplete');
    }

    // Skip guard for change password page (prevent infinite loop)
    if (pathname === '/client/change-password') return;

    /**
     * LOCALSTORAGE BYPASS: Check for recent password reset flag
     *
     * Prevents race condition where success UI flashes briefly before guard
     * redirects back to change-password page due to stale session state.
     *
     * When password is successfully changed, change-password page sets
     * 'passwordResetComplete' flag with current timestamp. Guard skips
     * mustChangePassword check for 5 minutes, allowing success UI to render
     * and user to navigate to dashboard while session updates propagate.
     *
     * Security: Client-side only, doesn't bypass backend validation.
     * Session mustChangePassword=false is still authoritative source of truth.
     */
    const resetFlag = localStorage.getItem('passwordResetComplete');
    let flagValid = false;

    if (resetFlag) {
      const resetTime = parseInt(resetFlag, 10);
      const fiveMinutes = 5 * 60 * 1000; // 300000ms
      if (!isNaN(resetTime) && Date.now() - resetTime < fiveMinutes) {
        flagValid = true;
      } else {
        // Flag expired or invalid - remove stale flag
        localStorage.removeItem('passwordResetComplete');
      }
    }

    // Force password reset if mustChangePassword flag is true AND bypass flag is not valid
    if (!flagValid && session?.user && (session.user as any).mustChangePassword === true) {
      router.replace('/client/change-password');
      return;
    }

    // Skip guard logic for login pages (mirror middleware behavior)
    if (pathname === '/client/login') return;

    // Redirect unauthenticated users to login
    if (status === 'unauthenticated') {
      router.replace('/client/login');
      return;
    }

    // Check if user is SUPER_ADMIN
    if (session?.user && (session.user as any).role === 'SUPER_ADMIN') {
      // HISTORY FIX: Use replace() to avoid polluting browser history with redirect entries
      // SUPER_ADMIN should use admin panel, not client portal
      router.replace('/admin');
    }
  }, [session, status, pathname, router]);

  // Show loading state while checking role
  if (status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Allow login pages to render even for unauthenticated users
  if (pathname === '/client/login' || pathname === '/client/change-password') {
    return <>{children}</>;
  }

  // Block unauthenticated users (redirect in progress)
  if (status === 'unauthenticated') {
    return null; // Prevent rendering during redirect
  }

  // Block SUPER_ADMIN (redirect in progress)
  if (session?.user && (session.user as any).role === 'SUPER_ADMIN') {
    return null; // Prevent rendering during redirect
  }

  // Block users who must change password (redirect in progress)
  if (session?.user && (session.user as any).mustChangePassword === true) {
    return null; // Prevent rendering during redirect
  }

  // Allow ADMIN and VIEWER
  return <>{children}</>;
}
