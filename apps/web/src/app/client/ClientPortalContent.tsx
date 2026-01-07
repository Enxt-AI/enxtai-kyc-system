'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { ClientAuthGuard } from './ClientAuthGuard';

/**
 * Client Portal Content Component
 *
 * Main layout component for client portal with navigation and content area.
 * Uses ClientAuthGuard for authentication protection.
 *
 * @remarks
 * Authentication is now handled by ClientAuthGuard component,
 * which can be reused in other client portal pages.
 */
export default function ClientPortalContent({ children }: { children: React.ReactNode }) {
  // Session is guaranteed to exist here due to ClientAuthGuard
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Add loading check to prevent undefined session access
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

  // Wrap content with ClientAuthGuard for authentication
  return (
    <ClientAuthGuard>
      <ClientPortalLayout
        session={session!}
        pathname={pathname}
        isMobileMenuOpen={isMobileMenuOpen}
        setIsMobileMenuOpen={setIsMobileMenuOpen}
      >
        {children}
      </ClientPortalLayout>
    </ClientAuthGuard>
  );
}

/**
 * Client Portal Layout
 *
 * Internal layout component that renders the portal UI.
 * Separated for better code organization.
 */
function ClientPortalLayout({
  session,
  pathname,
  isMobileMenuOpen,
  setIsMobileMenuOpen,
  children,
}: {
  session: any;
  pathname: string;
  isMobileMenuOpen: boolean;
  setIsMobileMenuOpen: (open: boolean) => void;
  children: React.ReactNode;
}) {

  /**
   * Handle Logout
   *
   * Signs out user and redirects to login page.
   */
  const handleLogout = async () => {
    await signOut({ callbackUrl: '/client/login' });
  };

  /**
   * Navigation Links
   *
   * Defines sidebar navigation structure.
   */
  const navLinks = [
    { href: '/client/dashboard', label: 'Dashboard', icon: '📊' },
    { href: '/client/submissions', label: 'Submissions', icon: '📋' },
    { href: '/client/settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile Menu Button - only render when sidebar exists */}
      {pathname !== '/client/login' && (
        <div className="lg:hidden fixed top-0 left-0 right-0 bg-white border-b border-gray-200 p-4 z-20">
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="text-gray-600 hover:text-gray-900"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {isMobileMenuOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>
      )}

      {/* Mobile Overlay - only render when sidebar exists */}
      {pathname !== '/client/login' && isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - only render when not on login page */}
      {pathname !== '/client/login' && (
        <div
          className={`
            fixed top-0 left-0 h-full w-64 bg-white border-r border-gray-200 z-40
            transform transition-transform duration-200 ease-in-out
            ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
            lg:translate-x-0
          `}
        >
        {/* Sidebar Header */}
        <div className="p-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Client Portal</h1>
          <div className="mt-2">
            <p className="text-sm text-gray-600">{session?.user?.email || 'Loading...'}</p>
            <span className="inline-block mt-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded">
              {session?.user?.role || 'Loading...'}
            </span>
          </div>
        </div>

        {/* Navigation Links */}
        <nav className="p-4">
          <ul className="space-y-2">
            {navLinks.map((link) => {
              const isActive = pathname === link.href;
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`
                      flex items-center px-4 py-3 rounded-md transition-colors
                      ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-700 hover:bg-gray-50'
                      }
                    `}
                  >
                    <span className="mr-3 text-xl">{link.icon}</span>
                    <span>{link.label}</span>
                  </Link>
                </li>
              );
            })}

            {/* Logout Button */}
            <li>
              <button
                onClick={handleLogout}
                className="w-full flex items-center px-4 py-3 rounded-md text-gray-700 hover:bg-gray-50 transition-colors"
              >
                <span className="mr-3 text-xl">🚪</span>
                <span>Logout</span>
              </button>
            </li>
          </ul>
        </nav>
      </div>
      )}

      {/* Main Content */}
      <div className={`${pathname !== '/client/login' ? 'lg:ml-64 pt-16 lg:pt-0' : ''}`}>
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
