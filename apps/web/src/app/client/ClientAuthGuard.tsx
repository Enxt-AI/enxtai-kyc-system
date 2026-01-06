'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

/**
 * Client Auth Guard Component
 *
 * Reusable authentication guard for client portal pages.
 *
 * @remarks
 * **Purpose**:
 * - Protects client portal pages from unauthenticated access
 * - Redirects unauthenticated users to login page
 * - Shows loading state during authentication check
 * - Can be used standalone or within layouts
 *
 * **Usage Example**:
 * ```tsx
 * import { ClientAuthGuard } from '@/app/client/ClientAuthGuard';
 *
 * export default function MyClientPage() {
 *   return (
 *     <ClientAuthGuard>
 *       <div>Protected content</div>
 *     </ClientAuthGuard>
 *   );
 * }
 * ```
 *
 * **Features**:
 * - Automatic redirect to /client/login when unauthenticated
 * - Loading indicator during session check
 * - Prevents flash of protected content
 * - Works with NextAuth v4 session management
 *
 * **Session States**:
 * - `loading`: Checking authentication status (shows loading UI)
 * - `authenticated`: User logged in (renders children)
 * - `unauthenticated`: No session (redirects to login)
 *
 * @param children - Protected content to render when authenticated
 * @returns Loading UI, null (during redirect), or protected children
 *
 * @see {@link https://next-auth.js.org/getting-started/client#usesession NextAuth useSession Documentation}
 */
export function ClientAuthGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();

  // Redirect to login if not authenticated
  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/client/login');
    }
  }, [status, router]);

  // Show loading state while checking authentication
  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
          <div className="text-gray-600">Verifying authentication...</div>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated (will redirect)
  if (!session) {
    return null;
  }

  // Render protected content
  return <>{children}</>;
}
