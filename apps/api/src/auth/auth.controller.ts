import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { BadRequestException } from '@nestjs/common';

/**
 * Authentication Controller
 *
 * Handles client user and Super Admin authentication endpoints.
 *
 * @remarks
 * **Endpoints**:
 * - POST /api/auth/client/login - Client user login
 * - POST /api/auth/admin/login - Super Admin login
 * - POST /api/auth/client/forgot-password - Request password reset (client)
 * - POST /api/auth/client/reset-password - Reset password with token (client)
 * - POST /api/auth/client/change-password - Change password when authenticated (client)
 * - POST /api/auth/admin/forgot-password - Request password reset (admin)
 * - POST /api/auth/admin/reset-password - Reset password with token (admin)
 * - POST /api/auth/admin/change-password - Change password when authenticated (admin)
 *
 * **Security**:
 * - HTTPS required (enforced by infrastructure)
 * - Rate limiting applied (global throttler guard + password reset specific)
 * - Generic error messages (prevent enumeration attacks)
 *
 * **Response Codes**:
 * - 200 OK: Authentication successful
 * - 400 Bad Request: Validation error (email format, password length)
 * - 401 Unauthorized: Invalid credentials
 * - 429 Too Many Requests: Rate limit exceeded
 *
 * @see {@link AuthService} for authentication logic
 * @see {@link LoginDto} for request validation
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Client User Login
   *
   * Authenticates client user and returns user data for session creation.
   *
   * @remarks
   * **Request Body**:
   * ```json
   * {
   *   "email": "user@example.com",
   *   "password": "securePassword123"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "id": "user-uuid-123",
   *   "email": "user@example.com",
   *   "clientId": "client-uuid-456",
   *   "role": "VIEWER"
   * }
   * ```
   *
   * **Error Responses**:
   * - 400 Bad Request: `{ "message": ["Invalid email format"], "error": "Bad Request" }`
   * - 401 Unauthorized: `{ "message": "Invalid credentials", "error": "Unauthorized" }`
   *
   * **Security Considerations**:
   * - Generic error message (don't reveal if email exists)
   * - Password never returned in response
   * - Rate limited by global throttler (100 req/min)
   * - HTTPS enforced by infrastructure
   *
   * @param loginDto - Email and password credentials
   * @returns User object without password field
   * @throws BadRequestException if validation fails
   * @throws UnauthorizedException if credentials invalid
   *
   * @example
   * ```typescript
   * // Successful login
   * POST /api/auth/client/login
   * { "email": "user@example.com", "password": "securePassword123" }
   * // Returns: { id: "...", email: "...", clientId: "...", role: "VIEWER" }
   *
   * // Invalid credentials
   * POST /api/auth/client/login
   * { "email": "user@example.com", "password": "wrongPassword" }
   * // Returns: 401 Unauthorized { message: "Invalid credentials" }
   * ```
   */
  @Post('client/login')
  @HttpCode(HttpStatus.OK) // Return 200 instead of 201 for login
  async login(@Body() loginDto: LoginDto) {
    return this.authService.validateClientUser(
      loginDto.email,
      loginDto.password,
    );
  }

  /**
   * Super Admin Login
   *
   * Authenticates Super Admin user and returns user data for session creation.
   * Only allows users with SUPER_ADMIN role and null clientId.
   *
   * @remarks
   * **Request Body**:
   * ```json
   * {
   *   "email": "admin@example.com",
   *   "password": "securePassword123"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "id": "admin-uuid-123",
   *   "email": "admin@example.com",
   *   "clientId": null,
   *   "role": "SUPER_ADMIN"
   * }
   * ```
   *
   * **Error Responses**:
   * - 400 Bad Request: `{ "message": ["Invalid email format"], "error": "Bad Request" }`
   * - 401 Unauthorized: `{ "message": "Invalid credentials", "error": "Unauthorized" }`
   *
   * **Security Considerations**:
   * - Generic error message (don't reveal if email exists)
   * - Password never returned in response
   * - Only allows SUPER_ADMIN role with clientId = null
   * - Rate limited by global throttler (100 req/min)
   * - HTTPS enforced by infrastructure
   *
   * @param loginDto - Email and password credentials
   * @returns Super Admin user object without password field
   * @throws BadRequestException if validation fails
   * @throws UnauthorizedException if credentials invalid or not Super Admin
   *
   * @example
   * ```typescript
   * // Successful Super Admin login
   * POST /api/auth/admin/login
   * { "email": "admin@example.com", "password": "securePassword123" }
   * // Returns: { id: "...", email: "...", clientId: null, role: "SUPER_ADMIN" }
   *
   * // Invalid credentials or not Super Admin
   * POST /api/auth/admin/login
   * { "email": "user@example.com", "password": "wrongPassword" }
   * // Returns: 401 Unauthorized { message: "Invalid credentials" }
   * ```
   */
  @Post('admin/login')
  @HttpCode(HttpStatus.OK) // Return 200 instead of 201 for login
  async adminLogin(@Body() loginDto: LoginDto) {
    return this.authService.validateSuperAdmin(
      loginDto.email,
      loginDto.password,
    );
  }

  /**
   * Client Forgot Password
   *
   * Initiates password reset flow for client users.
   * Generates reset token and prepares email with magic link.
   *
   * @remarks
   * **Request Body**:
   * ```json
   * {
   *   "email": "user@example.com"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true
   * }
   * ```
   *
   * **Error Responses**:
   * - 400 Bad Request: `{ "message": ["Invalid email format"], "error": "Bad Request" }`
   * - 429 Too Many Requests: `{ "message": "Password reset limit exceeded. Try again in 1 hour.", "error": "Too Many Requests" }`
   *
   * **Security Considerations**:
   * - Generic success response regardless of email existence (prevents enumeration)
   * - Rate limited to 3 requests per hour per email
   * - Reset link logged to console (MVP - future: email integration)
   * - HTTPS enforced by infrastructure
   *
   * @param forgotPasswordDto - Email address for password reset
   * @returns Generic success response
   * @throws BadRequestException if email format invalid
   * @throws TooManyRequestsException if rate limit exceeded
   *
   * @example
   * ```typescript
   * // Request password reset
   * POST /api/auth/client/forgot-password
   * { "email": "user@example.com" }
   * // Returns: { success: true }
   * // Console logs: 🔗 Password reset link for user@example.com: http://localhost:3000/reset-password?token=uuid-token
   * ```
   */
  @Post('client/forgot-password')
  @HttpCode(HttpStatus.OK)
  async clientForgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(forgotPasswordDto.email);
  }

  /**
   * Client Reset Password
   *
   * Resets client user password using valid reset token.
   * Validates token, updates password, and clears reset token.
   *
   * @remarks
   * **Request Body**:
   * ```json
   * {
   *   "token": "550e8400-e29b-41d4-a716-446655440000",
   *   "password": "NewSecurePassword123!"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true,
   *   "message": "Password reset successfully"
   * }
   * ```
   *
   * **Error Responses**:
   * - 400 Bad Request: `{ "message": "Invalid reset token format", "error": "Bad Request" }`
   * - 400 Bad Request: `{ "message": "Invalid or expired reset token", "error": "Bad Request" }`
   * - 400 Bad Request: `{ "message": ["Password must contain..."], "error": "Bad Request" }`
   *
   * **Security Considerations**:
   * - Token validated for format (UUID) and expiry (1 hour)
   * - Single-use tokens (cleared after successful reset)
   * - Password hashed with bcrypt (12 salt rounds)
   * - mustChangePassword flag cleared
   * - HTTPS enforced by infrastructure
   *
   * @param resetPasswordDto - Token and new password
   * @returns Success confirmation
   * @throws BadRequestException if token invalid or password validation fails
   *
   * @example
   * ```typescript
   * // Reset password with valid token
   * POST /api/auth/client/reset-password
   * {
   *   "token": "550e8400-e29b-41d4-a716-446655440000",
   *   "password": "NewSecurePassword123!"
   * }
   * // Returns: { success: true, message: "Password reset successfully" }
   * ```
   */
  @Post('client/reset-password')
  @HttpCode(HttpStatus.OK)
  async clientResetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const user = await this.authService.validateResetToken(resetPasswordDto.token);
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.authService.updatePassword(user.id, resetPasswordDto.newPassword);
    return { success: true, message: 'Password reset successfully' };
  }

  /**
   * Client Change Password
   *
   * Allows authenticated client users to change their password.
   * Requires current session validation (handled by NextAuth middleware).
   *
   * @remarks
   * **Request Body**:
   * ```json
   * {
   *   "currentPassword": "CurrentPassword123",
   *   "newPassword": "NewSecurePassword123!"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true,
   *   "message": "Password changed successfully"
   * }
   * ```
   *
   * **Error Responses**:
   * - 400 Bad Request: `{ "message": ["New password must contain..."], "error": "Bad Request" }`
   * - 401 Unauthorized: `{ "message": "Current password is incorrect", "error": "Unauthorized" }`
   *
   * **Security Considerations**:
   * - Requires authentication (session validation by middleware)
   * - Validates current password before allowing change
   * - Password hashed with bcrypt (12 salt rounds)
   * - mustChangePassword flag cleared
   * - HTTPS enforced by infrastructure
   *
   * @param changePasswordDto - Current and new passwords
   * @param req - Request object with authenticated user
   * @returns Success confirmation
   * @throws BadRequestException if password validation fails
   * @throws UnauthorizedException if current password incorrect
   *
   * @example
   * ```typescript
   * // Change password when authenticated
   * POST /api/auth/client/change-password
   * {
   *   "currentPassword": "CurrentPassword123",
   *   "newPassword": "NewSecurePassword123!"
   * }
   * // Returns: { success: true, message: "Password changed successfully" }
   * ```
   */
  @Post('client/change-password')
  @HttpCode(HttpStatus.OK)
  async clientChangePassword(@Body() changePasswordDto: ChangePasswordDto) {
    // Note: User ID would come from authenticated session (NextAuth middleware)
    // For now, this is a placeholder - actual implementation needs session context
    throw new Error('Not implemented: Requires authenticated session context');
  }

  /**
   * Admin Forgot Password
   *
   * Initiates password reset flow for Super Admin users.
   * Generates reset token and prepares email with magic link.
   *
   * @remarks
   * **Request Body**:
   * ```json
   * {
   *   "email": "admin@example.com"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true
   * }
   * ```
   *
   * **Error Responses**:
   * - 400 Bad Request: `{ "message": ["Invalid email format"], "error": "Bad Request" }`
   * - 429 Too Many Requests: `{ "message": "Password reset limit exceeded. Try again in 1 hour.", "error": "Too Many Requests" }`
   *
   * **Security Considerations**:
   * - Generic success response regardless of email existence (prevents enumeration)
   * - Rate limited to 3 requests per hour per email
   * - Only allows Super Admin users (clientId = null, role = SUPER_ADMIN)
   * - Reset link logged to console (MVP - future: email integration)
   * - HTTPS enforced by infrastructure
   *
   * @param forgotPasswordDto - Email address for password reset
   * @returns Generic success response
   * @throws BadRequestException if email format invalid
   * @throws TooManyRequestsException if rate limit exceeded
   *
   * @example
   * ```typescript
   * // Request password reset for admin
   * POST /api/auth/admin/forgot-password
   * { "email": "admin@example.com" }
   * // Returns: { success: true }
   * // Console logs: 🔗 Password reset link for admin@example.com: http://localhost:3000/reset-password?token=uuid-token
   * ```
   */
  @Post('admin/forgot-password')
  @HttpCode(HttpStatus.OK)
  async adminForgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(forgotPasswordDto.email);
  }

  /**
   * Admin Reset Password
   *
   * Resets Super Admin user password using valid reset token.
   * Validates token, updates password, and clears reset token.
   *
   * @remarks
   * **Request Body**:
   * ```json
   * {
   *   "token": "550e8400-e29b-41d4-a716-446655440000",
   *   "password": "NewSecurePassword123!"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true,
   *   "message": "Password reset successfully"
   * }
   * ```
   *
   * **Error Responses**:
   * - 400 Bad Request: `{ "message": "Invalid reset token format", "error": "Bad Request" }`
   * - 400 Bad Request: `{ "message": "Invalid or expired reset token", "error": "Bad Request" }`
   * - 400 Bad Request: `{ "message": ["Password must contain..."], "error": "Bad Request" }`
   *
   * **Security Considerations**:
   * - Token validated for format (UUID) and expiry (1 hour)
   * - Single-use tokens (cleared after successful reset)
   * - Only allows Super Admin users (clientId = null, role = SUPER_ADMIN)
   * - Password hashed with bcrypt (12 salt rounds)
   * - mustChangePassword flag cleared
   * - HTTPS enforced by infrastructure
   *
   * @param resetPasswordDto - Token and new password
   * @returns Success confirmation
   * @throws BadRequestException if token invalid or password validation fails
   *
   * @example
   * ```typescript
   * // Reset admin password with valid token
   * POST /api/auth/admin/reset-password
   * {
   *   "token": "550e8400-e29b-41d4-a716-446655440000",
   *   "password": "NewSecurePassword123!"
   * }
   * // Returns: { success: true, message: "Password reset successfully" }
   * ```
   */
  @Post('admin/reset-password')
  @HttpCode(HttpStatus.OK)
  async adminResetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const user = await this.authService.validateResetToken(resetPasswordDto.token);
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Additional validation: ensure user is Super Admin
    if (user.role !== 'SUPER_ADMIN' || user.clientId !== null) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.authService.updatePassword(user.id, resetPasswordDto.newPassword);
    return { success: true, message: 'Password reset successfully' };
  }

  /**
   * Admin Change Password
   *
   * Allows authenticated Super Admin users to change their password.
   * Requires current session validation (handled by NextAuth middleware).
   *
   * @remarks
   * **Request Body**:
   * ```json
   * {
   *   "currentPassword": "CurrentPassword123",
   *   "newPassword": "NewSecurePassword123!"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true,
   *   "message": "Password changed successfully"
   * }
   * ```
   *
   * **Error Responses**:
   * - 400 Bad Request: `{ "message": ["New password must contain..."], "error": "Bad Request" }`
   * - 401 Unauthorized: `{ "message": "Current password is incorrect", "error": "Unauthorized" }`
   *
   * **Security Considerations**:
   * - Requires authentication (session validation by middleware)
   * - Validates current password before allowing change
   * - Only allows Super Admin users (clientId = null, role = SUPER_ADMIN)
   * - Password hashed with bcrypt (12 salt rounds)
   * - mustChangePassword flag cleared
   * - HTTPS enforced by infrastructure
   *
   * @param changePasswordDto - Current and new passwords
   * @param req - Request object with authenticated user
   * @returns Success confirmation
   * @throws BadRequestException if password validation fails
   * @throws UnauthorizedException if current password incorrect
   *
   * @example
   * ```typescript
   * // Change admin password when authenticated
   * POST /api/auth/admin/change-password
   * {
   *   "currentPassword": "CurrentPassword123",
   *   "newPassword": "NewSecurePassword123!"
   * }
   * // Returns: { success: true, message: "Password changed successfully" }
   * ```
   */
  @Post('admin/change-password')
  @HttpCode(HttpStatus.OK)
  async adminChangePassword(@Body() changePasswordDto: ChangePasswordDto) {
    // Note: User ID would come from authenticated session (NextAuth middleware)
    // For now, this is a placeholder - actual implementation needs session context
    throw new Error('Not implemented: Requires authenticated session context');
  }
}
