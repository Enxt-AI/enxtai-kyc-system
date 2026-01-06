'use client';

import { SessionProvider } from 'next-auth/react';
import ClientPortalContent from './ClientPortalContent';

/**
 * Client Portal Layout
 * 
 * Protected layout for client portal with session management and navigation.
 * 
 * @remarks
 * **Features**:
 * - Session-based authentication (redirects if not logged in)
 * - Sidebar navigation (Dashboard, Submissions, Settings, Logout)
 * - Responsive design (collapsible sidebar on mobile)
 * - User info display (email, client role)
 * 
 * **Route Protection**:
 * - Checks authentication status on mount
 * - Redirects to /client/login if no session
 * - Shows loading state during auth check
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
    <SessionProvider>
      <ClientPortalContent>{children}</ClientPortalContent>
    </SessionProvider>
  );
}


