"use client";

import { useSession, signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import { ClientAuthGuard } from "./ClientAuthGuard";
import {
  LayoutDashboard,
  ClipboardList,
  Settings,
  Key,
  LogOut,
  Menu,
  X,
} from "lucide-react";

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
export default function ClientPortalContent({
  children,
}: {
  children: React.ReactNode;
}) {
  // Session is guaranteed to exist here due to ClientAuthGuard
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Add loading check to prevent undefined session access
  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen bg-zinc-50">
        <div className="text-center flex flex-col items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-zinc-200 border-t-zinc-900 mb-4"></div>
          <p className="mt-4 text-zinc-500 font-medium text-sm">
            Authenticating...
          </p>
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
    // ISOLATED CLIENT SIGNOUT: Routes to /api/auth/client/signout (ClientSessionProvider basePath)
    await signOut({ callbackUrl: "/client/login" });
  };

  /**
   * Navigation Links
   *
   * Defines sidebar navigation structure.
   */
  const navLinks = [
    { href: "/client/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/client/submissions", label: "Submissions", icon: ClipboardList },
    { href: "/client/settings", label: "Settings", icon: Settings },
    { href: "/client/change-password", label: "Change Password", icon: Key }, // Voluntary password changes
  ];

  return (
    <div className="min-h-screen bg-zinc-50 selection:bg-zinc-900 selection:text-white font-sans flex">
      {/* Mobile Overlay - only render when sidebar exists */}
      {pathname !== "/client/login" && isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - only render when not on login page */}
      {pathname !== "/client/login" && (
        <div
          className={`
            fixed top-0 left-0 h-full w-64 bg-white border-r border-zinc-200 z-40
            transform transition-transform duration-200 ease-in-out flex flex-col
            ${isMobileMenuOpen ? "translate-x-0" : "-translate-x-full"}
            lg:translate-x-0
          `}
        >
          {/* Sidebar Header */}
          <div className="p-6 border-b border-zinc-200">
            <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
              Client Portal
            </h1>
          </div>

          {/* User Info Block Removed (now in floating header) */}

          {/* Navigation Links */}
          <nav className="flex-1 overflow-y-auto px-4 py-6">
            <ul className="space-y-1.5 relative">
              {navLinks.map((link) => {
                const isActive = pathname === link.href;
                const Icon = link.icon;
                return (
                  <li key={link.href} className="relative">
                    <Link
                      href={link.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`
                      group flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-200
                      ${
                        isActive
                          ? "bg-zinc-100 text-zinc-900"
                          : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                      }
                    `}
                    >
                      <Icon
                        className={`w-5 h-5 transition-colors ${isActive ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-900"}`}
                      />
                      <span>{link.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Logout Button */}
          <div className="border-t border-zinc-200 p-4">
            <button
              onClick={handleLogout}
              className="group flex w-full items-center space-x-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200"
            >
              <LogOut className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div
        className={`flex flex-col flex-1 min-w-0 min-h-screen ${pathname !== "/client/login" ? "lg:ml-64" : ""}`}
      >
        {/* Floating Header / Navbar */}
        {pathname !== "/client/login" && (
          <div className="p-4 md:p-6 pb-2 z-30 sticky top-0">
            <header className="flex items-center justify-between bg-white/80 backdrop-blur-md border border-zinc-200 shadow-sm rounded-2xl px-4 py-3">
              {/* Mobile Hamburger & Title */}
              <div className="flex items-center space-x-4 lg:hidden">
                <button
                  onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                  className="text-zinc-500 hover:text-zinc-900 transition-colors rounded-lg hover:bg-zinc-100 p-1"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
                  Client Portal
                </h1>
              </div>

              {/* Desktop Spacer */}
              <div className="hidden lg:block flex-1" />

              {/* User Info (Moved from Sidebar) */}
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-zinc-900 truncate flex-1 justify-end items-end">
                    {session?.user?.email || "Loading..."}
                  </p>
                  <p className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
                    {session?.user?.role || "CLIENT"}
                  </p>
                </div>
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-900 font-bold shadow-sm">
                  {session?.user?.email?.[0].toUpperCase() || "C"}
                </div>
              </div>
            </header>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 pt-0">{children}</main>
      </div>
    </div>
  );
}
