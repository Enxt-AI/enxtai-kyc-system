'use client';

/**
 * Client Providers Wrapper
 *
 * Wraps the app with client-side providers that require 'use client' directive.
 * This pattern allows the root layout to remain a Server Component while still
 * providing client-side context to all pages.
 *
 * @remarks
 * **Purpose**:
 * - Keeps root layout as Server Component (required for metadata export)
 * - Follows Next.js 13+ App Router best practices
 * - Currently no global client providers needed (SessionProviders are layout-specific)
 *
 * **Session Management**:
 * - Admin portal uses AdminSessionProvider (basePath="/api/auth/admin")
 * - Client portal uses ClientSessionProvider (basePath="/api/auth/client")
 * - Root page is public and doesn't require authentication
 *
 * @see {@link https://nextjs.org/docs/app/building-your-application/configuring/typescript#client-component-type-error Next.js Client Components}
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
