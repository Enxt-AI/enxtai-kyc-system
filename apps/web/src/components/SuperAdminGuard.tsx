'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * SuperAdminGuard Component
 *
 * Authorization guard that restricts access to SUPER_ADMIN role only.
 *
 * @remarks
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
 * // In admin layout or individual admin pages
 * <SuperAdminGuard>
 *   <YourAdminPanelContent />
 * </SuperAdminGuard>
 * ```
 *
 * **Redirect Flow**:
 * - Unauthenticated → `/login` (Super Admin login page)
 * - ADMIN/VIEWER → `/client/dashboard` (their proper portal)
 * - SUPER_ADMIN → Allow access (render children)
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
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') return;

    // Redirect unauthenticated users to login
    if (status === 'unauthenticated') {
      router.push('/login');
      return;
    }

    // Check if user is NOT SUPER_ADMIN
    if (session?.user && (session.user as any).role !== 'SUPER_ADMIN') {
      // ADMIN/VIEWER should use their client portal
      router.push('/client/dashboard');
    }
  }, [session, status, router]);

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

  // Block unauthenticated and non-SUPER_ADMIN (redirect in progress)
  if (status === 'unauthenticated' || (session?.user && (session.user as any).role !== 'SUPER_ADMIN')) {
    return null; // Prevent rendering during redirect
  }

  // Allow SUPER_ADMIN only
  return <>{children}</>;
}
