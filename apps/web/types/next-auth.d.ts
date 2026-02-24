import { DefaultSession } from 'next-auth';

/**
 * NextAuth Type Augmentation
 * 
 * Extends NextAuth types to include custom user properties.
 * 
 * @remarks
 * **Purpose**:
 * - Add clientId and role to session and JWT types
 * - Enables type-safe access in components
 * - Prevents TypeScript errors when accessing custom claims
 * 
 * **Usage**:
 * ```typescript
 * const { data: session } = useSession();
 * const clientId = session?.user?.clientId; // Type-safe
 * const role = session?.user?.role; // Type-safe
 * ```
 * 
 * **Custom Properties**:
 * - `clientId`: Client UUID for multi-tenancy
 * - `role`: User role (ADMIN or VIEWER)
 * 
 * @see {@link https://next-auth.js.org/getting-started/typescript NextAuth TypeScript Documentation}
 */
declare module 'next-auth' {
  /**
   * Extended Session Type
   * 
   * Adds custom properties to session.user object.
   */
  interface Session {
    user: {
      /** User UUID */
      id: string;
      /** User email address */
      email: string;
      /** Client UUID for multi-tenant API requests */
      clientId: string;
      /** User role (ADMIN or VIEWER) */
      role: string;
    } & DefaultSession['user'];
  }

  /**
   * Extended User Type
   * 
   * Adds custom properties to user object returned from authorize().
   */
  interface User {
    /** User UUID */
    id: string;
    /** User email address */
    email: string;
    /** Client UUID for multi-tenant API requests */
    clientId: string;
    /** User role (ADMIN or VIEWER) */
    role: string;
  }
}

declare module 'next-auth/jwt' {
  /**
   * Extended JWT Type
   * 
   * Adds custom properties to JWT token.
   */
  interface JWT {
    /** Client UUID for multi-tenant API requests */
    clientId: string;
    /** User role (ADMIN or VIEWER) */
    role: string;
  }
}
