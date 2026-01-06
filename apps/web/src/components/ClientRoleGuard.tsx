'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * ClientRoleGuard Component
 *
 * Authorization guard that prevents SUPER_ADMIN users from accessing the client portal.
 *
 * @remarks
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
 * // In client portal layout or pages
 * <ClientRoleGuard>
 *   <YourClientPortalContent />
 * </ClientRoleGuard>
 * ```
 *
 * **Redirect Flow**:
 * - SUPER_ADMIN detected → Redirect to `/admin`
 * - ADMIN/VIEWER → Allow access (render children)
 * - Loading state shown during role check to prevent content flash
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
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    // Wait for session to load
    if (status === 'loading') return;

    // Check if user is SUPER_ADMIN
    if (session?.user && (session.user as any).role === 'SUPER_ADMIN') {
      // SUPER_ADMIN should use admin panel, not client portal
      router.push('/admin');
    }
  }, [session, status, router]);

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

  // Block SUPER_ADMIN (redirect in progress)
  if (session?.user && (session.user as any).role === 'SUPER_ADMIN') {
    return null; // Prevent rendering during redirect
  }

  // Allow ADMIN and VIEWER
  return <>{children}</>;
}
