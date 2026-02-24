/**
 * DEPRECATED: Shared NextAuth Handler
 *
 * This shared authentication handler has been replaced by isolated handlers:
 * - Super Admin: /api/auth/admin/[...nextauth]/route.ts (uses auth-admin.ts)
 * - Client Portal: /api/auth/client/[...nextauth]/route.ts (uses auth-client.ts)
 *
 * Reason for deprecation:
 * - Shared handler caused multi-tab session conflicts
 * - Single cookie (next-auth.session-token) overwritten when logging into different portals
 * - Isolated handlers use separate cookies (next-auth.super-admin-token, next-auth.client-token)
 *
 * Migration:
 * - Super Admin login pages now use adminSignIn() from @/lib/auth-admin
 * - Client login pages now use clientSignIn() from @/lib/auth-client
 * - Guards and middleware updated to use adminAuth() and clientAuth() respectively
 *
 * TODO: Remove this file after confirming all login flows work with isolated handlers
 *
 * @deprecated Use isolated auth handlers instead
 */

/*
import NextAuth from 'next-auth';
import { authOptions } from '@/lib/auth';

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
*/

// Temporary fallback (remove after testing)
export async function GET() {
  return new Response(
    JSON.stringify({
      error: 'Deprecated endpoint. Use /api/auth/admin or /api/auth/client'
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  );
}

export async function POST() {
  return new Response(
    JSON.stringify({
      error: 'Deprecated endpoint. Use /api/auth/admin or /api/auth/client'
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  );
}
