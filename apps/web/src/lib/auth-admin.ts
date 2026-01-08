import NextAuth, { DefaultSession, NextAuthOptions, getServerSession } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

/**
 * NEXTAUTH V4 COMPATIBILITY NOTE
 *
 * This file uses NextAuth v4 API (not v5):
 * - `NextAuth(options)` returns a handler function (not { handlers, auth })
 * - Server-side auth uses `getServerSession(req, res, options)`
 * - Client-side auth uses `useSession()` hook (unchanged)
 *
 * Isolated cookie names prevent session conflicts between portals:
 * - Super Admin: next-auth.super-admin-token
 * - Client Portal: next-auth.client-token
 *
 * @see {@link https://next-auth.js.org/getting-started/upgrade-v4 NextAuth v4 Documentation}
 */

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      clientId: string | null; // null for SUPER_ADMIN
      role: string;
      portal: string;
      mustChangePassword?: boolean; // Not used for super admins, but included for type consistency
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    email: string;
    clientId: string | null; // null for SUPER_ADMIN
    role: string;
    portal: string;
    mustChangePassword?: boolean; // Not used for super admins, but included for type consistency
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    clientId: string | null; // null for SUPER_ADMIN
    role: string;
    portal: string;
    mustChangePassword?: boolean; // Not used for super admins, but included for type consistency
  }
}

/**
 * NextAuth.js Configuration (v4) - Super Admin Authentication
 *
 * Configures isolated authentication for Super Admin portal using credentials provider.
 * Uses separate cookie name to prevent session conflicts with client portal.
 *
 * @remarks
 * **Authentication Flow**:
 * 1. Super Admin submits email/password via admin login form
 * 2. NextAuth calls authorize() function
 * 3. authorize() sends credentials to backend API
 * 4. Backend validates credentials and SUPER_ADMIN role
 * 5. NextAuth creates JWT token with user data
 * 6. Session created with clientId=null and SUPER_ADMIN role
 *
 * **Session Structure**:
 * ```typescript
 * {
 *   user: {
 *     id: string;
 *     email: string;
 *     clientId: null,      // Always null for Super Admins
 *     role: 'SUPER_ADMIN';
 *   }
 * }
 * ```
 *
 * **Token Claims**:
 * - `sub`: User ID (standard JWT claim)
 * - `email`: User email
 * - `clientId`: null (Super Admin has no client association)
 * - `role`: 'SUPER_ADMIN'
 *
 * **Security**:
 * - JWT tokens stored in httpOnly cookies (prevents XSS)
 * - CSRF protection enabled by default
 * - Token expiry: 30 days (configurable)
 * - Automatic token refresh on each request
 * - Isolated cookie name prevents session conflicts
 *
 * @see {@link https://next-auth.js.org/configuration/options NextAuth Options Documentation}
 */
export const authAdminOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      /**
       * Authorize Function
       *
       * Validates Super Admin credentials against backend API.
       *
       * @param credentials - Email and password from admin login form
       * @returns User object if valid Super Admin, null if invalid
       *
       * @remarks
       * **Process**:
       * 1. Send POST request to backend admin login endpoint
       * 2. Backend validates credentials (bcrypt) and SUPER_ADMIN role
       * 3. Returns user data (id, email, clientId=null, role='SUPER_ADMIN') if valid
       * 4. Returns null if invalid credentials or not SUPER_ADMIN (triggers error in login form)
       *
       * **Backend Endpoint**: POST /api/auth/admin/login
       *
       * **Error Handling**:
       * - Network errors: Caught and logged
       * - Invalid credentials: Backend returns 401 (returns null)
       * - Non-Super Admin users: Backend returns 403 (returns null)
       * - Server errors: Backend returns 500 (returns null)
       */
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Call backend admin login endpoint
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/admin/login`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: credentials.email,
                password: credentials.password,
              }),
            }
          );

          if (!response.ok) {
            // Invalid credentials, not Super Admin, or server error
            return null;
          }

          const user = await response.json();

          // Return user object (stored in JWT)
          return {
            id: user.id,
            email: user.email,
            clientId: user.clientId, // Should be null for Super Admin
            role: user.role, // Should be 'SUPER_ADMIN'
            portal: 'admin',
          };
        } catch (error) {
          console.error('Super Admin authentication error:', error);
          return null;
        }
      },
    }),
  ],

  /**
   * JWT Callback
   *
   * Customizes JWT token structure for Super Admin.
   *
   * @param token - Current JWT token
   * @param user - User object from authorize() (only on signin)
   * @returns Modified JWT token
   *
   * @remarks
   * **Purpose**:
   * - Add custom claims (clientId=null, role='SUPER_ADMIN') to JWT token
   * - Store minimal user data in token (not password)
   * - Token used for session creation
   *
   * **Token Structure**:
   * ```typescript
   * {
   *   sub: string;        // User ID (standard claim)
   *   email: string;
   *   clientId: null;     // Always null for Super Admin
   *   role: 'SUPER_ADMIN'; // Always SUPER_ADMIN
   *   iat: number;        // Issued at (standard claim)
   *   exp: number;        // Expiry (standard claim)
   * }
   * ```
   */
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // User object available on signin
        token.clientId = user.clientId;
        token.role = user.role;
        token.portal = 'admin';
      }
      return token;
    },

    /**
     * Session Callback
     *
     * Customizes session structure sent to client for Super Admin.
     *
     * @param session - Current session
     * @param token - JWT token
     * @returns Modified session
     *
     * @remarks
     * **Purpose**:
     * - Extract clientId and role from JWT token
     * - Add to session object for client access
     * - Used by useSession() hook in admin frontend
     *
     * **Session sent to client**:
     * ```typescript
     * {
     *   user: {
     *     id: string;
     *     email: string;
     *     clientId: null;    // Always null for Super Admin
     *     role: 'SUPER_ADMIN'; // Always SUPER_ADMIN
     *   }
     * }
     * ```
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.clientId = token.clientId as string | null;
        session.user.role = token.role as string;
        session.user.portal = token.portal as string;
      }
      return session;
    },

    /**
     * Redirect Callback
     *
     * Fallback redirect handler for NextAuth flows.
     *
     * @param url - Default redirect URL from NextAuth
     * @param baseUrl - Application base URL
     * @returns Safe redirect destination URL
     *
     * @remarks
     * **Security Purpose**:
     * - Prevents open redirect vulnerabilities
     * - Only allows redirects to internal URLs (same origin)
     *
     * **Role-Based Redirects**:
     * - NOT handled here due to NextAuth v4 limitations
     * - Primary role logic implemented client-side in admin login page
     * - Admin login page uses `signIn(redirect: false)` + `getSession()` + `window.location.href`
     *
     * **When This Callback Runs**:
     * - OAuth/social login callbacks
     * - API-triggered `signIn()` calls with `redirect: true`
     * - Other NextAuth redirect scenarios
     *
     * **Fallback Behavior**:
     * - Internal URLs: passed through unchanged
     * - External URLs: redirected to base URL for safety
     *
     * @see {@link https://next-auth.js.org/configuration/callbacks#redirect-callback NextAuth Redirect Callback}
     */
    async redirect({ url, baseUrl }) {
      // Prevent open redirects - only allow internal URLs
      if (url.startsWith(baseUrl)) {
        return url;
      }

      // External URLs get redirected to base URL for security
      return baseUrl;
    },
  },

  /**
   * Pages Configuration
   *
   * Custom authentication pages for Super Admin.
   *
   * @remarks
   * **Login Pages**:
   * - Super Admin: /admin/login (default sign-in page)
   * - Client Admin: /client/login (handled by separate auth config)
   *
   * **Rationale**:
   * - Super Admins use /admin/login for platform administration
   * - Client Admins use /client/login for tenant-specific access
   * - Isolated authentication prevents session conflicts
   * - Role-based redirect after login ensures correct dashboard
   */
  pages: {
    signIn: '/admin/login',
  },

  /**
   * Session Configuration
   *
   * JWT-based sessions (no database).
   *
   * @remarks
   * **Strategy**: JWT
   * - No database session storage required
   * - Stateless authentication
   * - Token stored in httpOnly cookie
   *
   * **Max Age**: 30 days
   * - Token expires after 30 days
   * - User must login again
   * - Configurable based on security requirements
   */
  session: {
    strategy: 'jwt' as const,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  /**
   * Cookies Configuration
   *
   * Isolated cookie names for Super Admin authentication.
   *
   * @remarks
   * **Purpose**:
   * - Prevent session conflicts between Super Admin and Client portals
   * - Allow simultaneous logins in different tabs
   * - Separate cookie storage for each authentication context
   *
   * **Cookie Names**:
   * - Session token: next-auth.super-admin-token
   * - CSRF token: next-auth.super-admin.csrf-token
   * - PKCE code verifier: next-auth.super-admin.pkce.code_verifier
   */
  cookies: {
    sessionToken: {
      name: `next-auth.super-admin-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: `next-auth.super-admin.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    pkceCodeVerifier: {
      name: `next-auth.super-admin.pkce.code_verifier`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },

  /**
   * Secret
   *
   * Secret key for signing JWT tokens.
   *
   * @remarks
   * **Important**:
   * - Must be set in production via NEXTAUTH_SECRET environment variable
   * - Used for token signing and CSRF protection
   * - Keep secret and rotate periodically
   */
  secret: process.env.NEXTAUTH_SECRET,
};

// NextAuth v4 default export - returns handler function
export default NextAuth(authAdminOptions);

/**
 * Server-Side Authentication Helper
 *
 * Retrieves session in server contexts (middleware, API routes, server components).
 *
 * @param req - Next.js request object
 * @param res - Next.js response object
 * @returns Session object or null if unauthenticated
 *
 * @example
 * ```ts
 * // In middleware.ts
 * import { getAdminSession } from '@/lib/auth-admin';
 *
 * export async function middleware(req) {
 *   const session = await getAdminSession(req, null);
 *   if (!session) {
 *     return NextResponse.redirect('/admin/login');
 *   }
 * }
 * ```
 *
 * @remarks
 * **NextAuth v4 API**:
 * - Uses `getServerSession` from 'next-auth'
 * - Requires passing options object (authAdminOptions)
 * - Returns same session structure as client-side `useSession()`
 *
 * **Session Structure**:
 * ```ts
 * {
 *   user: {
 *     id: string;
 *     email: string;
 *     clientId: string | null;
 *     role: 'SUPER_ADMIN' | 'ADMIN' | 'VIEWER';
 *     portal: 'admin' | 'client';
 *   }
 * }
 * ```
 */
export async function getAdminSession(req: any, res: any) {
  return await getServerSession(req, res, authAdminOptions);
}

/**
 * Server-Side Authentication Helper (alias for getAdminSession)
 *
 * Retrieves session in server contexts (middleware, API routes, server components).
 *
 * @param req - Next.js request object
 * @param res - Next.js response object
 * @returns Session object or null if unauthenticated
 */
export const adminAuth = getAdminSession;