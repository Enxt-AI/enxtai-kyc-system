import { IsEmail, IsString, MinLength } from 'class-validator';

/**
 * Login DTO
 * 
 * Data Transfer Object for client user authentication.
 * 
 * @remarks
 * **Validation Rules**:
 * - Email: Must be valid email format (RFC 5322 compliant)
 * - Password: Minimum 8 characters (enforced for security)
 * 
 * **Security Considerations**:
 * - Password transmitted over HTTPS only (plain text in transit is encrypted by TLS)
 * - Backend performs bcrypt comparison (never stores plaintext passwords)
 * - Generic error message on failure (don't reveal if email exists)
 * 
 * @example
 * ```json
 * {
 *   "email": "user@example.com",
 *   "password": "securePassword123"
 * }
 * ```
 */
export class LoginDto {
  /**
   * User's email address
   * 
   * @remarks
   * Used as primary identifier for authentication.
   * Must match email stored in ClientUser table.
   * 
   * @example 'user@example.com'
   */
  @IsEmail({}, { message: 'Invalid email format' })
  email!: string;

  /**
   * User's password
   * 
   * @remarks
   * Minimum 8 characters required for security.
   * Compared against bcrypt hash stored in database.
   * 
   * @minLength 8
   * @example 'securePassword123'
   */
  @IsString({ message: 'Password must be a string' })
  @MinLength(8, { message: 'Password must be at least 8 characters' })
  password!: string;
}
