import { Body, Controller, Post, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

/**
 * Authentication Controller
 *
 * Handles client user and Super Admin authentication endpoints.
 *
 * @remarks
 * **Endpoints**:
 * - POST /api/auth/client/login - Client user login
 * - POST /api/auth/admin/login - Super Admin login
 *
 * **Security**:
 * - HTTPS required (enforced by infrastructure)
 * - Rate limiting applied (global throttler guard)
 * - Generic error messages (prevent enumeration attacks)
 *
 * **Response Codes**:
 * - 200 OK: Authentication successful
 * - 400 Bad Request: Validation error (email format, password length)
 * - 401 Unauthorized: Invalid credentials
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
}
