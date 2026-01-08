'use client';

import { SessionProvider } from 'next-auth/react';
import SuperAdminGuard from '@/components/SuperAdminGuard';
import AdminSessionProvider from '@/components/AdminSessionProvider';
import { useSession, signOut } from 'next-auth/react';
import { useAdminSession } from '@/lib/use-admin-session';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

/**
 * Admin Panel Layout Content
 *
 * Internal component with navigation sidebar and user info.
 *
 * @remarks
 * Displays:
 * - Admin panel title and user badge
 * - Navigation links (Dashboard, Clients, KYC Review)
 * - Logout button
 * - Responsive sidebar with mobile menu
 */
function AdminLayoutContent({ children }: { children: React.ReactNode }) {
  const { data: session } = useAdminSession();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navigation = [
    { name: 'Dashboard', href: '/admin/dashboard', icon: '📊' },
    { name: 'Client Management', href: '/admin/clients', icon: '🏢' },
    { name: 'KYC Review', href: '/admin/kyc-review', icon: '✅' },
  ];

  return (
    <div className="flex h-screen bg-gray-100">
      {/* Sidebar - only render when not on login page */}
      {pathname !== '/admin/login' && (
        <aside
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto`}
      >
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-gray-200 p-4">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Admin Panel</h1>
              <p className="text-xs text-gray-500">Platform Management</p>
            </div>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700"
            >
              ✕
            </button>
          </div>

          {/* User Info */}
          <div className="border-b border-gray-200 p-4">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
                {session?.user?.email?.[0].toUpperCase() || 'A'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {session?.user?.email || 'Admin'}
                </p>
                <p className="text-xs text-white bg-purple-600 px-2 py-0.5 rounded-full inline-block">
                  SUPER_ADMIN
                </p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
            <ul className="space-y-2">
              {navigation.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      className={`flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                        isActive
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                      onClick={() => setSidebarOpen(false)}
                    >
                      <span className="text-lg">{item.icon}</span>
                      <span>{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Logout Button */}
          {/* ISOLATED ADMIN SIGNOUT: Routes to /api/auth/admin/signout (AdminSessionProvider basePath) */}
          <div className="border-t border-gray-200 p-4">
            <button
              onClick={() => signOut({ callbackUrl: '/admin/login' })}
              className="flex w-full items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition"
            >
              <span className="text-lg">🚪</span>
              <span>Logout</span>
            </button>
          </div>
        </div>
      </aside>
      )}

      {/* Mobile Overlay - only render when sidebar exists */}
      {pathname !== '/admin/login' && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className={`flex flex-1 flex-col overflow-hidden ${pathname !== '/admin/login' ? 'lg:ml-64' : ''}`}>
        {/* Mobile Header - only render when sidebar exists */}
        {pathname !== '/admin/login' && (
          <header className="lg:hidden bg-white border-b border-gray-200 px-4 py-3">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSidebarOpen(true)}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg
                className="h-6 w-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <h1 className="text-lg font-semibold text-gray-900">Admin Panel</h1>
            <div className="w-6" /> {/* Spacer for centering */}
          </div>
        </header>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto bg-gray-100 p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

/**
 * Admin Panel Layout
 *
 * Protected layout for platform administrators with role-based access control.
 *
 * @remarks
 * **Features**:
 * - SUPER_ADMIN-only access (enforced by SuperAdminGuard)
 * - Sidebar navigation for admin functions
 * - User info display with role badge
 * - Responsive design (mobile-friendly)
 * - Logout functionality
 *
 * **Route Protection**:
 * - Middleware ensures valid JWT token (redirects to /login if missing)
 * - SuperAdminGuard blocks ADMIN/VIEWER users (redirects to /client/dashboard)
 * - Only SUPER_ADMIN role can access admin panel
 *
 * **RBAC Strategy**:
 * - SUPER_ADMIN users have `clientId=null` (platform administrators)
 * - They can view and manage all clients and KYC submissions
 * - ADMIN/VIEWER users are redirected to their tenant-specific client portal
 *
 * **Navigation Structure**:
 * ```
 * ┌─────────────────────────────────────┐
 * │  Admin Panel                        │
 * │  admin@enxtai.com (SUPER_ADMIN)     │
 * ├─────────────────────────────────────┤
 * │  📊 Dashboard                       │
 * │  🏢 Client Management               │
 * │  ✅ KYC Review                      │
 * │  🚪 Logout                          │
 * └─────────────────────────────────────┘
 * ```
 *
 * **Security**:
 * - Cross-tenant operations protected by SUPER_ADMIN role check
 * - Automatic redirect for non-admin users
 * - Session-based authentication with JWT tokens
 *
 * @param props.children - Page content to render within the admin layout
 */
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminSessionProvider>
      <SuperAdminGuard>
        <AdminLayoutContent>{children}</AdminLayoutContent>
      </SuperAdminGuard>
    </AdminSessionProvider>
  );
}
