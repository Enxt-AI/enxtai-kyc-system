'use client';

import { useSession } from 'next-auth/react';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * ClientRoleGuard Component
 *
 * Authorization guard that prevents SUPER_ADMIN from accessing client portal.
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
 *
 * **RBAC Strategy**:
 * - Allowed Roles: ADMIN, VIEWER (tenant users)
 * - Blocked Role: SUPER_ADMIN (platform administrator)
 * - Redirect: SUPER_ADMIN → `/admin`
 *
 * **Security Rationale**:
 * SUPER_ADMIN users manage multiple clients and should not access single-tenant
 * portals. Their `clientId=null` would cause API errors on tenant-scoped endpoints
 * like `/api/v1/client/stats` which require a valid clientId.
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
 * - ADMIN/VIEWER → Allow access (render children)
 * - Loading state shown during authentication and role checks
 *
 * **Session Structure**:
 * Expects NextAuth session with:
 * ```typescript
 * session.user.role: 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER'
 * session.user.clientId: string | null
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
  if (pathname === '/client/login') {
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

  // Allow ADMIN and VIEWER
  return <>{children}</>;
}
