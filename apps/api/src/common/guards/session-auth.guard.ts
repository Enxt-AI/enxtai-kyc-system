import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Session Authentication Guard
 *
 * Validates NextAuth session tokens for client portal API routes.
 *
 * @remarks
 * **Purpose**:
 * Protects client portal endpoints (/api/v1/client/*) by validating session-based
 * authentication tokens from NextAuth. This guard differs from API key authentication
 * used for external client APIs.
 *
 * **Token Format**:
 * - Header: `Authorization: Bearer <base64_token>`
 * - Token Structure (base64-encoded JSON):
 * ```json
 * {
 *   "userId": "usr_123",
 *   "clientId": "client_456",
 *   "role": "ADMIN",
 *   "email": "admin@acme.com"
 * }
 * ```
 *
 * **Validation Logic**:
 * 1. Extract Authorization header from request
 * 2. Verify Bearer token format
 * 3. Decode base64 token to JSON
 * 4. Validate required fields (userId, clientId, role, email)
 * 5. Inject validated data into request context
 *
 * **Request Context Injection**:
 * After successful validation, the following fields are added to `request.user`:
 * - `userId`: Authenticated user's ID
 * - `clientId`: Client organization ID (for tenant isolation)
 * - `role`: User role (ADMIN, VIEWER, etc.)
 * - `email`: User's email address
 *
 * **Security Considerations**:
 * - Token should be short-lived (e.g., 30 days, refreshed by NextAuth)
 * - Base64 encoding is NOT encryption (do not store sensitive data)
 * - HTTPS required in production to prevent token interception
 * - Consider adding token signature verification in production
 * - Current implementation is interim; production should use proper JWT validation
 *
 * **Usage**:
 * Apply to controllers or routes requiring session authentication:
 * ```typescript
 * @UseGuards(SessionAuthGuard)
 * @Controller('api/v1/client')
 * export class ClientController { ... }
 * ```
 *
 * **Error Scenarios**:
 * - 401 Unauthorized: Missing Authorization header
 * - 401 Unauthorized: Invalid Bearer token format
 * - 401 Unauthorized: Token decode error (invalid base64)
 * - 401 Unauthorized: Missing required fields (clientId, userId, etc.)
 *
 * **Future Enhancements**:
 * - Add JWT signature verification using NextAuth secret
 * - Implement token expiration checking
 * - Add rate limiting per user/client
 * - Log authentication attempts for security auditing
 * - Support refresh token flow
 */
@Injectable()
export class SessionAuthGuard implements CanActivate {
  /**
   * Validate Request
   *
   * Checks if request has valid NextAuth session token.
   *
   * @param context - Execution context containing request object
   * @returns True if authenticated, throws UnauthorizedException otherwise
   */
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();

    // Extract Authorization header
    const authHeader = request.headers['authorization'];

    if (!authHeader) {
      throw new UnauthorizedException('Missing Authorization header');
    }

    // Verify Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Invalid Authorization format. Expected: Bearer <token>');
    }

    // Extract token
    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    if (!token) {
      throw new UnauthorizedException('Missing authentication token');
    }

    try {
      // Decode base64 token
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const sessionData = JSON.parse(decoded);

      // Validate required fields
      // Note: clientId can be null for SUPER_ADMIN users (platform administrators)
      if (
        !sessionData.userId ||
        !sessionData.role ||
        !sessionData.email
      ) {
        throw new UnauthorizedException('Invalid token structure. Missing required fields.');
      }

      // Validate clientId based on role
      // SUPER_ADMIN: clientId must be null (platform-level access)
      // ADMIN/VIEWER: clientId must be a valid UUID (tenant-scoped access)
      if (sessionData.role === 'SUPER_ADMIN') {
        if (sessionData.clientId !== null && sessionData.clientId !== undefined) {
          throw new UnauthorizedException('SUPER_ADMIN must have null clientId');
        }
      } else {
        if (!sessionData.clientId) {
          throw new UnauthorizedException('Client users must have a valid clientId');
        }
      }

      // Inject session data into request context
      request.user = {
        userId: sessionData.userId,
        clientId: sessionData.clientId, // Can be null for SUPER_ADMIN
        role: sessionData.role,
        email: sessionData.email,
      };

      // Also inject clientId directly for backward compatibility
      request.clientId = sessionData.clientId;

      return true;
    } catch (error: any) {
      // Handle decode errors (invalid base64, invalid JSON, etc.)
      if (error instanceof UnauthorizedException) {
        throw error;
      }

      throw new UnauthorizedException(
        `Token validation failed: ${error.message}`,
      );
    }
  }
}
