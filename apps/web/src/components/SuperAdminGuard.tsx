'use client';

import { useAdminSession } from '@/lib/use-admin-session';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect } from 'react';

/**
 * SuperAdminGuard Component
 *
 * Authorization guard for SUPER_ADMIN role only.
 *
 * @remarks
 * **IMPORTANT: Must be used within AdminSessionProvider context**
 * - Relies on AdminSessionProvider's basePath="/api/auth/admin"
 * - Checks next-auth.super-admin-token cookie (isolated from client)
 * - useSession() automatically uses admin session context
 *
 * **Multi-Tab Isolation**:
 * - Admin sessions: next-auth.super-admin-token
 * - Client sessions: next-auth.client-token
 * - Both can coexist in different tabs without conflicts
 *
 * **Purpose**:
 * - Protects admin panel from unauthorized access
 * - Prevents ADMIN/VIEWER (tenant users) from viewing cross-tenant data
 * - Ensures only platform administrators can manage clients and review KYC submissions
 *
 * **RBAC Strategy**:
 * - Allowed Role: SUPER_ADMIN only
 * - Blocked Roles: ADMIN, VIEWER (redirected to their client portal)
 * - Unauthenticated: Redirected to login page
 *
 * **Security Rationale**:
 * Admin panel exposes sensitive cross-tenant operations:
 * - View all clients and their configurations
 * - Review KYC submissions across all tenants
 * - Approve/reject KYC applications
 * - Manage API keys and webhooks
 *
 * Only SUPER_ADMIN (platform administrators with `clientId=null`) should access these functions.
 *
 * **Usage**:
 * ```tsx
 * // ✅ CORRECT: Within AdminSessionProvider
 * <AdminSessionProvider>
 *   <SuperAdminGuard>
 *     <YourAdminPanelContent />
 *   </SuperAdminGuard>
 * </AdminSessionProvider>
 *
 * // ❌ WRONG: Outside AdminSessionProvider
 * <SuperAdminGuard>
 *   <YourAdminPanelContent />
 * </SuperAdminGuard>  // Will not work properly
 * ```
 *
 * **Redirect Flow**:
 * - Unauthenticated → `/admin/login` (Super Admin login page)
 * - ADMIN/VIEWER → `/client/dashboard` (their proper portal)
 * - SUPER_ADMIN → Allow access (render children)
 * - Login pages → Allow rendering (even for unauthenticated users)
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
export default function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  // ISOLATED ADMIN SESSION: useAdminSession() reads next-auth.super-admin-token
  // via AdminSessionProvider basePath="/api/auth/admin"
  const { data: session, status } = useAdminSession();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') return;

    // Skip guard logic for login pages (mirror middleware behavior)
    if (pathname === '/admin/login') return;

    // HISTORY FIX: Use replace() to avoid polluting browser history with redirect entries
    // Redirect unauthenticated users to login
    if (status === 'unauthenticated') {
      router.replace('/admin/login');
      return;
    }

    // Check if user is NOT SUPER_ADMIN
    if (session?.user && (session.user as any).role !== 'SUPER_ADMIN') {
      // ADMIN/VIEWER should use their client portal
      router.replace('/client/dashboard');
    }
  }, [session, status, router, pathname]);

  // Show loading state while checking authentication and role
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
  if (pathname === '/admin/login' || pathname === '/client/login') {
    return <>{children}</>;
  }

  // Block unauthenticated and non-SUPER_ADMIN (redirect in progress)
  if (status === 'unauthenticated' || (session?.user && (session.user as any).role !== 'SUPER_ADMIN')) {
    return null; // Prevent rendering during redirect
  }

  // Allow SUPER_ADMIN only
  return <>{children}</>;
}
