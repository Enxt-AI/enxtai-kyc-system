import { IsString, MinLength, Matches } from 'class-validator';

/**
 * Change Password Request DTO
 *
 * DTO for authenticated password change (session-based).
 * Used for forced first-login password resets and voluntary password changes.
 *
 * @remarks
 * **Authentication Required**:
 * - Requires valid session token (SessionAuthGuard)
 * - Extracts userId from authenticated session
 * - Used when mustChangePassword flag is true (first login)
 *
 * **Password Requirements**:
 * - Minimum 8 characters with mixed character types
 *
 * **Flow**:
 * 1. Validate session and extract userId
 * 2. Verify current password matches
 * 3. Hash new password with bcrypt (12 salt rounds)
 * 4. Update user password
 * 5. Clear mustChangePassword flag (set to false)
 * 6. Don't clear reset token (not applicable for session-based changes)
 *
 * **Use Cases**:
 * - Forced password reset on first login (mustChangePassword = true)
 * - Voluntary password change by authenticated user
 *
 * @example
 * ```json
 * {
 *   "currentPassword": "CurrentPass123!",
 *   "newPassword": "MyNewSecurePass456!"
 * }
 * ```
 */
export class ChangePasswordDto {
  /**
   * Current password for verification
   * Required for security when changing password
   */
  @IsString({ message: 'Current password is required' })
  currentPassword!: string;

  /**
   * New password for the account
   * Must meet strength requirements
   */
  @IsString({ message: 'New password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    }
  )
  newPassword!: string;
}