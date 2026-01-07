'use client';

import { SessionProvider } from 'next-auth/react';

/**
 * Client Providers Wrapper
 *
 * Wraps the app with client-side providers that require 'use client' directive.
 * This pattern allows the root layout to remain a Server Component while still
 * providing client-side context to all pages.
 *
 * @remarks
 * **Purpose**:
 * - Enables useSession() hook throughout the application
 * - Keeps root layout as Server Component (required for metadata export)
 * - Follows Next.js 13+ App Router best practices
 *
 * **NextAuth Session Provider**:
 * - Makes session data available via useSession() hook
 * - Handles automatic token refresh
 * - Provides loading states during session checks
 *
 * @see {@link https://nextjs.org/docs/app/building-your-application/configuring/typescript#client-component-type-error Next.js Client Components}
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
