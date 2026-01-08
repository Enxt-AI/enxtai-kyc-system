import { Injectable, UnauthorizedException, BadRequestException, InternalServerErrorException, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';

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

  // Rate limiting for password reset (3 requests per hour per email)
  // In-memory storage (migrate to Redis for production)
  private resetRateLimit = new Map<string, { count: number; resetAt: number }>();

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
        mustChangePassword: true, // Forces password reset on first login for newly onboarded clients
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

  /**
   * Check Password Reset Rate Limit
   *
   * Enforces rate limiting for password reset requests (3 per hour per email).
   * Uses in-memory storage for MVP (migrate to Redis for production).
   *
   * @private
   * @param email - Email address to check rate limit for
   * @returns true if request allowed, throws HttpException if exceeded
   * @throws HttpException (429) if rate limit exceeded
   */
  private checkRateLimit(email: string): boolean {
    const now = Date.now();
    const key = email.toLowerCase();
    const limit = 3; // 3 requests per hour
    const windowMs = 60 * 60 * 1000; // 1 hour in milliseconds

    const record = this.resetRateLimit.get(key);

    if (record && record.resetAt > now) {
      // Within window, check count
      if (record.count >= limit) {
        throw new HttpException('Password reset limit exceeded. Try again in 1 hour.', HttpStatus.TOO_MANY_REQUESTS);
      }
      // Increment count
      record.count++;
    } else {
      // New window or expired window
      this.resetRateLimit.set(key, { count: 1, resetAt: now + windowMs });
    }

    return true;
  }

  /**
   * Generate Password Reset Token
   *
   * Creates a secure reset token for password reset flow.
   * Uses cryptographically secure UUID with 1-hour expiry.
   *
   * @param userId - User ID to generate token for
   * @returns Plaintext token for email link (UUID format)
   * @throws InternalServerErrorException if database update fails
   *
   * @remarks
   * **Token Security**:
   * - Uses crypto.randomUUID() (128-bit entropy, cryptographically secure)
   * - 1-hour expiry (balance between security and UX)
   * - Single-use (cleared after successful reset)
   * - Stored in database (consider hashing in production)
   *
   * **Database Updates**:
   * - Sets resetToken field with UUID
   * - Sets resetTokenExpiry to 1 hour from now
   * - Overwrites any existing reset token
   */
  async generateResetToken(userId: string): Promise<string> {
    try {
      const token = randomUUID();
      const expiry = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      await this.prisma.clientUser.update({
        where: { id: userId },
        data: {
          resetToken: token,
          resetTokenExpiry: expiry,
        },
      });

      return token;
    } catch (error) {
      throw new InternalServerErrorException('Failed to generate reset token');
    }
  }

  /**
   * Validate Password Reset Token
   *
   * Validates a reset token and returns the associated user if valid.
   * Checks token existence, format, and expiry.
   *
   * @param token - Reset token from magic link
   * @returns ClientUser object without password if token valid, null otherwise
   * @throws BadRequestException if token format invalid
   *
   * @remarks
   * **Validation Logic**:
   * 1. Check token is valid UUID format
   * 2. Query database for user with matching resetToken
   * 3. Verify resetTokenExpiry > current time (not expired)
   * 4. Return user data without password field
   *
   * **Security**:
   * - Timing-safe comparison (database handles this)
   * - No information leakage about token validity
   * - Single-use tokens (cleared after successful reset)
   */
  async validateResetToken(token: string): Promise<any | null> {
    try {
      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(token)) {
        throw new BadRequestException('Invalid reset token format');
      }

      const user = await this.prisma.clientUser.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: {
            gt: new Date(), // Not expired
          },
        },
        select: {
          id: true,
          email: true,
          clientId: true,
          role: true,
          createdAt: true,
          updatedAt: true,
          // Exclude password and token fields
        },
      });

      return user;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to validate reset token');
    }
  }

  /**
   * Update User Password
   *
   * Updates a user's password with proper hashing and flag management.
   * Used for both reset flow and authenticated password changes.
   *
   * @param userId - User ID to update password for
   * @param newPassword - Plain text new password
   * @param clearResetToken - Whether to clear reset token fields (default: true)
   * @param currentPassword - Current password for verification (optional)
   * @throws BadRequestException if current password verification fails
   * @throws InternalServerErrorException if database update fails
   *
   * @remarks
   * **Password Security**:
   * - Uses bcrypt with 12 salt rounds (industry standard)
   * - Salt rounds provide computational cost against brute force
   * - Timing-safe hashing prevents side-channel attacks
   *
   * **Current Password Verification**:
   * - If currentPassword provided, verifies it matches stored hash
   * - Prevents unauthorized password changes
   * - Required for authenticated password changes
   *
   * **Flag Management**:
   * - Always sets mustChangePassword = false (password changed)
   * - Clears resetToken and resetTokenExpiry if clearResetToken = true
   * - For authenticated changes: set clearResetToken = false
   * - For reset flow: set clearResetToken = true (single-use token)
   */
  async updatePassword(
    userId: string,
    newPassword: string,
    clearResetToken: boolean = true,
    currentPassword?: string
  ): Promise<void> {
    try {
      // If current password is provided, verify it first
      if (currentPassword) {
        const user = await this.prisma.clientUser.findUnique({
          where: { id: userId },
          select: { password: true },
        });

        if (!user) {
          throw new BadRequestException('User not found');
        }

        const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isCurrentPasswordValid) {
          throw new BadRequestException('Current password is incorrect');
        }
      }

      const hashedPassword = await bcrypt.hash(newPassword, 12);

      const updateData: any = {
        password: hashedPassword,
        mustChangePassword: false, // Password has been changed
      };

      if (clearResetToken) {
        updateData.resetToken = null;
        updateData.resetTokenExpiry = null;
      }

      await this.prisma.clientUser.update({
        where: { id: userId },
        data: updateData,
      });
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to update password');
    }
  }

  /**
   * Request Password Reset
   *
   * Initiates password reset flow for an email address.
   * Generates reset token and prepares for email sending.
   *
   * @param email - Email address to send reset link to
   * @param portal - Portal type ('client' or 'admin') for correct reset link path
   * @returns Object with success status and optional token
   * @throws TooManyRequestsException if rate limit exceeded
   *
   * @remarks
   * **Security Considerations**:
   * - Returns generic success response regardless of email existence
   * - Prevents email enumeration attacks
   * - Rate limited to 3 requests per hour per email
   *
   * **Flow**:
   * 1. Check rate limit (throws if exceeded)
   * 2. Find user by email (case-insensitive)
   * 3. If user exists: generate reset token
   * 4. Return success (token used for email link generation)
   *
   * **Email Integration** (Future Phase):
   * - Client Portal: `${FRONTEND_URL}/client/reset-password?token=${token}`
   * - Admin Portal: `${FRONTEND_URL}/admin/reset-password?token=${token}`
   * - For MVP: console.log the reset link
   */
  async requestPasswordReset(email: string, portal: 'client' | 'admin' = 'client'): Promise<{ success: boolean; token?: string }> {
    // Check rate limit first
    this.checkRateLimit(email);

    try {
      // Find user by email (case-insensitive)
      const user = await this.prisma.clientUser.findUnique({
        where: { email: email.toLowerCase() },
        select: { id: true, email: true },
      });

      if (!user) {
        // Return generic success to prevent email enumeration
        return { success: true };
      }

      // Generate reset token
      const token = await this.generateResetToken(user.id);

      // For MVP: log the reset link (future: send email)
      const resetPath = portal === 'admin' ? '/admin/reset-password' : '/client/reset-password';
      console.log(`🔗 Password reset link for ${email}: ${process.env.FRONTEND_URL || 'http://localhost:3000'}${resetPath}?token=${token}`);

      return { success: true, token };
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      throw new InternalServerErrorException('Failed to process password reset request');
    }
  }
}
