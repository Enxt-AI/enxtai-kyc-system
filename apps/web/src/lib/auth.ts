import NextAuth, { DefaultSession, NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      clientId: string;
      role: string;
    } & DefaultSession['user'];
  }

  interface User {
    id: string;
    email: string;
    clientId: string;
    role: string;
  }
}

/**
 * NextAuth.js Configuration (v4)
 *
 * Configures authentication for client portal using credentials provider.
 *
 * @remarks
 * **Authentication Flow**:
 * 1. User submits email/password via login form
 * 2. NextAuth calls authorize() function
 * 3. authorize() sends credentials to backend API
 * 4. Backend validates credentials and returns user data
 * 5. NextAuth creates JWT token with user data
 * 6. Session created with clientId and role claims
 *
 * **Session Structure**:
 * ```typescript
 * {
 *   user: {
 *     id: string;
 *     email: string;
 *     clientId: string;
 *     role: 'ADMIN' | 'VIEWER';
 *   }
 * }
 * ```
 *
 * **Token Claims**:
 * - `sub`: User ID (standard JWT claim)
 * - `email`: User email
 * - `clientId`: Client UUID (for multi-tenancy)
 * - `role`: User role (ADMIN or VIEWER)
 *
 * **Security**:
 * - JWT tokens stored in httpOnly cookies (prevents XSS)
 * - CSRF protection enabled by default
 * - Token expiry: 30 days (configurable)
 * - Automatic token refresh on each request
 *
 * @see {@link https://next-auth.js.org/configuration/options NextAuth Options Documentation}
 */
export const authOptions: NextAuthOptions = {
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
       * Validates user credentials against backend API.
       *
       * @param credentials - Email and password from login form
       * @returns User object if valid, null if invalid
       *
       * @remarks
       * **Process**:
       * 1. Send POST request to backend login endpoint
       * 2. Backend validates credentials (bcrypt)
       * 3. Returns user data (id, email, clientId, role) if valid
       * 4. Returns null if invalid (triggers error in login form)
       *
       * **Backend Endpoint**: POST /api/auth/client/login
       *
       * **Error Handling**:
       * - Network errors: Caught and logged
       * - Invalid credentials: Backend returns 401 (returns null)
       * - Server errors: Backend returns 500 (returns null)
       */
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          // Call backend login endpoint
          const response = await fetch(
            `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/auth/client/login`,
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
            // Invalid credentials or server error
            return null;
          }

          const user = await response.json();

          // Return user object (stored in JWT)
          return {
            id: user.id,
            email: user.email,
            clientId: user.clientId,
            role: user.role,
          };
        } catch (error) {
          console.error('Authentication error:', error);
          return null;
        }
      },
    }),
  ],

  /**
   * JWT Callback
   *
   * Customizes JWT token structure.
   *
   * @param token - Current JWT token
   * @param user - User object from authorize() (only on signin)
   * @returns Modified JWT token
   *
   * @remarks
   * **Purpose**:
   * - Add custom claims (clientId, role) to JWT token
   * - Store minimal user data in token (not password)
   * - Token used for session creation
   *
   * **Token Structure**:
   * ```typescript
   * {
   *   sub: string;        // User ID (standard claim)
   *   email: string;
   *   clientId: string;   // Custom claim
   *   role: string;       // Custom claim
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
      }
      return token;
    },

    /**
     * Session Callback
     *
     * Customizes session structure sent to client.
     *
     * @param session - Current session
     * @param token - JWT token
     * @returns Modified session
     *
     * @remarks
     * **Purpose**:
     * - Extract clientId and role from JWT token
     * - Add to session object for client access
     * - Used by useSession() hook in frontend
     *
     * **Session sent to client**:
     * ```typescript
     * {
     *   user: {
     *     id: string;
     *     email: string;
     *     clientId: string;   // From JWT token
     *     role: string;       // From JWT token
     *   }
     * }
     * ```
     */
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.clientId = token.clientId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },

  /**
   * Pages Configuration
   *
   * Custom authentication pages.
   *
   * @remarks
   * **Login Pages**:
   * - Super Admin: /login (default sign-in page)
   * - Client Admin: /client-login (accessed via middleware redirect)
   *
   * **Rationale**:
   * - Super Admins use /login for internal access
   * - Client Admins use /client-login for tenant-specific access
   * - Middleware redirects /client/* routes to /client-login
   * - Role-based redirect after login ensures correct dashboard
   */
  pages: {
    signIn: '/login',
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

export default NextAuth(authOptions);
