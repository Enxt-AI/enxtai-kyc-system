"use client";

import { SessionProvider } from "next-auth/react";
import SuperAdminGuard from "@/components/SuperAdminGuard";
import AdminSessionProvider from "@/components/AdminSessionProvider";
import { useSession, signOut } from "next-auth/react";
import { useAdminSession } from "@/lib/use-admin-session";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  Building2,
  CheckSquare,
  Key,
  LogOut,
  Menu,
  X,
} from "lucide-react";

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
    { name: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard },
    { name: "Client Management", href: "/admin/clients", icon: Building2 },
    { name: "KYC Review", href: "/admin/kyc-review", icon: CheckSquare },
    { name: "Change Password", href: "/admin/change-password", icon: Key }, // SELF-SERVICE PASSWORD CHANGE: Allows Super Admin to update password anytime (voluntary, not forced)
  ];

  return (
    <div className="flex h-screen bg-zinc-50 font-sans selection:bg-zinc-900 selection:text-white">
      {/* Sidebar - only render when not on login page */}
      {pathname !== "/admin/login" && (
        <aside
          className={`${
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          } fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-auto`}
        >
          <div className="flex h-full flex-col">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 p-6 bg-white">
              <div>
                <h1 className="text-xl font-bold text-zinc-900 tracking-tight">
                  Admin Panel
                </h1>
                <p className="text-xs text-zinc-500 font-medium mt-0.5">
                  Platform Management
                </p>
              </div>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden text-zinc-400 hover:text-zinc-900 transition-colors rounded-lg hover:bg-zinc-100 p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* User Info Block Removed (now in floating header) */}

            {/* Navigation */}
            <nav className="flex-1 overflow-y-auto px-4 py-6 bg-white">
              <ul className="space-y-1.5 relative">
                {navigation.map((item) => {
                  const isActive = pathname === item.href;
                  return (
                    <li key={item.name} className="relative">
                      <Link
                        href={item.href}
                        className={`group flex items-center space-x-3 rounded-lg px-3.5 py-2.5 text-sm font-medium transition-all duration-200 ${
                          isActive
                            ? "bg-zinc-100 text-zinc-900"
                            : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
                        }`}
                        onClick={() => setSidebarOpen(false)}
                      >
                        <item.icon
                          className={`w-5 h-5 transition-colors ${isActive ? "text-zinc-900" : "text-zinc-400 group-hover:text-zinc-900"}`}
                        />
                        <span>{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            {/* Logout Button */}
            {/* ISOLATED ADMIN SIGNOUT: Routes to /api/auth/admin/signout (AdminSessionProvider basePath) */}
            <div className="border-t border-zinc-200 p-4 bg-white">
              <button
                onClick={() => signOut({ callbackUrl: "/admin/login" })}
                className="group flex w-full items-center space-x-3 rounded-lg px-3.5 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-all duration-200"
              >
                <LogOut className="w-5 h-5 text-zinc-400 group-hover:text-zinc-900 transition-colors" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* Mobile Overlay - only render when sidebar exists */}
      {pathname !== "/admin/login" && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div
        className={`flex flex-1 flex-col overflow-hidden ${pathname !== "/admin/login" ? "" : ""}`}
      >
        {/* Floating Header / Navbar */}
        {pathname !== "/admin/login" && (
          <div className="p-4 md:p-6 pb-2 z-30 sticky top-0">
            <header className="flex items-center justify-between bg-white/80 backdrop-blur-md border border-zinc-200 shadow-sm rounded-2xl px-4 py-3">
              {/* Mobile Hamburger & Title */}
              <div className="flex items-center space-x-4 lg:hidden">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="text-zinc-500 hover:text-zinc-900 transition-colors rounded-lg hover:bg-zinc-100 p-1"
                >
                  <Menu className="h-6 w-6" />
                </button>
                <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
                  Admin
                </h1>
              </div>

              {/* Desktop Spacer */}
              <div className="hidden lg:block flex-1" />

              {/* User Info (Moved from Sidebar) */}
              <div className="flex items-center space-x-3">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-zinc-900 truncate">
                    {session?.user?.email || "Admin"}
                  </p>
                  <p className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase">
                    SUPER_ADMIN
                  </p>
                </div>
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-900 font-bold shadow-sm">
                  {session?.user?.email?.[0].toUpperCase() || "A"}
                </div>
              </div>
            </header>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 pt-0 bg-transparent">
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
