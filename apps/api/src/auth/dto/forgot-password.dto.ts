import { IsEmail } from 'class-validator';

/**
 * Forgot Password Request DTO
 *
 * DTO for requesting a password reset via email magic link.
 * Used by both client portal and admin portal endpoints.
 *
 * @remarks
 * **Security Considerations**:
 * - Rate limited to 3 requests per hour per email
 * - Returns generic success response regardless of email existence
 * - Prevents email enumeration attacks
 *
 * **Rate Limiting**:
 * - 3 reset requests per hour per email address
 * - In-memory tracking (migrate to Redis for production)
 * - Applies to both `/api/v1/client/forgot-password` and `/api/admin/forgot-password`
 *
 * **Email Link Format**:
 * - Client Portal: `${FRONTEND_URL}/client/reset-password?token=${token}`
 * - Admin Portal: `${FRONTEND_URL}/admin/reset-password?token=${token}`
 *
 * @example
 * ```json
 * {
 *   "email": "user@example.com"
 * }
 * ```
 */
export class ForgotPasswordDto {
  /**
   * Email address for password reset
   * Must be a valid email format
   */
  @IsEmail({}, { message: 'Please provide a valid email address' })
  email!: string;
}