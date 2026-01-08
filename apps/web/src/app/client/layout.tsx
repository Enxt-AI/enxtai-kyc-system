'use client';

import ClientSessionProvider from '@/components/ClientSessionProvider';
import ClientPortalContent from './ClientPortalContent';
import ClientRoleGuard from '@/components/ClientRoleGuard';

/**
 * Client Portal Layout
 *
 * Protected layout for client portal with role-based access control and session management.
 *
 * @remarks
 * **Features**:
 * - Role-based access control (ADMIN, VIEWER only)
 * - Session-based authentication (redirects if not logged in)
 * - Sidebar navigation (Dashboard, Submissions, Settings, Logout)
 * - Responsive design (collapsible sidebar on mobile)
 * - User info display (email, client role)
 *
 * **Route Protection**:
 * - Middleware ensures valid JWT token (redirects to /client-login if missing)
 * - ClientAuthGuard checks authentication status (inside ClientPortalContent)
 * - ClientRoleGuard blocks SUPER_ADMIN users (redirects to /admin/dashboard)
 * - Only ADMIN and VIEWER roles can access client portal
 *
 * **RBAC Strategy**:
 * - SUPER_ADMIN users have `clientId=null` and cannot access tenant-scoped APIs
 * - They are automatically redirected to `/admin/dashboard`
 * - ADMIN/VIEWER users have valid `clientId` and can access their tenant's portal
 *
 * **Navigation Structure**:
 * ```
 * ┌─────────────────────────────────────┐
 * │  Client Portal                      │
 * │  user@example.com (VIEWER)          │
 * ├─────────────────────────────────────┤
 * │  📊 Dashboard                       │
 * │  📋 Submissions                     │
 * │  ⚙️  Settings                       │
 * │  🚪 Logout                          │
 * └─────────────────────────────────────┘
 * ```
 *
 * **Mobile Behavior**:
 * - Hamburger menu icon on mobile
 * - Sidebar slides in/out
 * - Overlay closes sidebar when clicking outside
 */
export default function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // ISOLATED CLIENT AUTH: Uses /api/auth/client handler with client-token cookie
    <ClientSessionProvider>
      <ClientRoleGuard>
        <ClientPortalContent>{children}</ClientPortalContent>
      </ClientRoleGuard>
    </ClientSessionProvider>
  );
}


