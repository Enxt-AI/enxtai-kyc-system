import { IsString, IsUUID, MinLength, Matches } from 'class-validator';

/**
 * Reset Password Request DTO
 *
 * DTO for resetting password using a magic link token.
 * Used by both client portal and admin portal reset endpoints.
 *
 * @remarks
 * **Token Validation**:
 * - Must be valid UUID format (crypto.randomUUID())
 * - Must exist in database and not be expired (1 hour expiry)
 * - Single-use: cleared after successful password reset
 *
 * **Password Requirements**:
 * - Minimum 12 characters (NIST recommendation)
 * - Must contain uppercase letter, lowercase letter, number, and special character
 * - Enforced via regex pattern validation
 *
 * **Security Flow**:
 * 1. Validate token exists and not expired
 * 2. Hash new password with bcrypt (12 salt rounds)
 * 3. Update user password and clear mustChangePassword flag
 * 4. Clear reset token (single-use)
 *
 * @example
 * ```json
 * {
 *   "token": "550e8400-e29b-41d4-a716-446655440000",
 *   "newPassword": "MySecurePass123!"
 * }
 * ```
 */
export class ResetPasswordDto {
  /**
   * Reset token from magic link
   * Must be valid UUID format
   */
  @IsString({ message: 'Reset token is required' })
  @IsUUID('4', { message: 'Invalid reset token format' })
  token!: string;

  /**
   * New password for the account
   * Must meet strength requirements
   */
  @IsString({ message: 'New password is required' })
  @MinLength(12, { message: 'Password must be at least 12 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }
  )
  newPassword!: string;
}