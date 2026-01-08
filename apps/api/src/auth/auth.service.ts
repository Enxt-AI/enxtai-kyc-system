import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

/**
 * Authentication Service
 *
 * Handles client user authentication and credential validation.
 *
 * @remarks
 * **Security Features**:
 * - Bcrypt password comparison (timing-safe, prevents rainbow table attacks)
 * - Generic error messages (don't reveal if email exists to prevent enumeration)
 * - Password never returned in response (excluded from SELECT)
 *
 * **Authentication Flow**:
 * 1. Lookup user by email
 * 2. Compare provided password with bcrypt hash
 * 3. Return user data without password field
 * 4. Throw UnauthorizedException on any failure
 *
 * @see {@link LoginDto} for request validation
 */
@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validate Client User Credentials
   *
   * Authenticates a client user by email and password using bcrypt comparison.
   *
   * @remarks
   * **Security Considerations**:
   * - Uses bcrypt.compare() for timing-safe password verification
   * - Returns generic "Invalid credentials" error (prevents email enumeration)
   * - Excludes password field from response (never transmit hashes)
   * - Salt rounds configured in database (10-12 recommended)
   *
   * **Error Handling**:
   * - User not found → UnauthorizedException
   * - Invalid password → UnauthorizedException
   * - Both cases return same error message (security best practice)
   *
   * @param email - User's email address (case-sensitive)
   * @param password - Plain text password to verify
   * @returns ClientUser object without password field
   * @throws UnauthorizedException if credentials invalid
   *
   * @example
   * ```typescript
   * const user = await authService.validateClientUser(
   *   'user@example.com',
   *   'securePassword123'
   * );
   * // Returns: { id: '...', email: '...', clientId: '...', role: 'VIEWER' }
   * ```
   */
  async validateClientUser(email: string, password: string) {
    // Find user by email
    const user = await this.prisma.clientUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true, // Need password for comparison
        clientId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // User not found - return generic error (don't reveal email existence)
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Compare password with bcrypt hash (timing-safe comparison)
    const isPasswordValid = await bcrypt.compare(password, user.password);

    // Invalid password - return generic error
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Return user without password field (security best practice)
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Find Client User by ID
   *
   * Retrieves client user for session refresh and validation.
   * Used by NextAuth to fetch user data when validating JWT tokens.
   *
   * @remarks
   * **Usage**:
   * - Session refresh (verify user still exists)
   * - Token validation (ensure user not deleted/disabled)
   * - Profile data retrieval
   *
   * **Security**:
   * - Password field excluded from response
   * - Returns null if user not found (handle gracefully in caller)
   *
   * @param id - User UUID
   * @returns ClientUser object without password, or null if not found
   *
   * @example
   * ```typescript
   * const user = await authService.findClientUserById('user-uuid-123');
   * if (user) {
   *   // User exists, session valid
   * } else {
   *   // User deleted, invalidate session
   * }
   * ```
   */
  async findClientUserById(id: string) {
    return this.prisma.clientUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        clientId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
        // Exclude password field for security
      },
    });
  }

  /**
   * Validate Super Admin Credentials
   *
   * Authenticates a Super Admin user by email and password using bcrypt comparison.
   * Only allows users with SUPER_ADMIN role and null clientId.
   *
   * @remarks
   * **Security Considerations**:
   * - Uses bcrypt.compare() for timing-safe password verification
   * - Returns generic "Invalid credentials" error (prevents email enumeration)
   * - Excludes password field from response (never transmit hashes)
   * - Only allows SUPER_ADMIN role with clientId = null
   * - Salt rounds configured in database (10-12 recommended)
   *
   * **Error Handling**:
   * - User not found → UnauthorizedException
   * - Invalid password → UnauthorizedException
   * - Non-Super Admin user → UnauthorizedException
   * - All cases return same error message (security best practice)
   *
   * @param email - Super Admin's email address (case-sensitive)
   * @param password - Plain text password to verify
   * @returns ClientUser object without password field (SUPER_ADMIN only)
   * @throws UnauthorizedException if credentials invalid or not Super Admin
   *
   * @example
   * ```typescript
   * const user = await authService.validateSuperAdmin(
   *   'admin@example.com',
   *   'securePassword123'
   * );
   * // Returns: { id: '...', email: '...', clientId: null, role: 'SUPER_ADMIN' }
   * ```
   */
  async validateSuperAdmin(email: string, password: string) {
    // Find user by email
    const user = await this.prisma.clientUser.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true, // Need password for comparison
        clientId: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // User not found or not a Super Admin - return generic error
    if (!user || user.role !== 'SUPER_ADMIN' || user.clientId !== null) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Compare password with bcrypt hash (timing-safe comparison)
    const isPasswordValid = await bcrypt.compare(password, user.password);

    // Invalid password - return generic error
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Return user without password field (security best practice)
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
}
