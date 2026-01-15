import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus, Logger } from '@nestjs/common';
import { DigiLockerAuthService } from './digilocker-auth.service';
import { DigiLockerException } from './exceptions/digilocker.exception';
import { InitiateAuthDto } from './dto/initiate-auth.dto';
import { CallbackDto } from './dto/callback.dto';

/**
 * DigiLocker Authentication Controller
 *
 * Handles OAuth 2.0 authorization endpoints for DigiLocker integration.
 * Provides endpoints for initiating authorization flow and handling callbacks.
 *
 * @remarks
 * **Endpoints**:
 * - `POST /api/digilocker/auth/initiate`: Start OAuth flow
 * - `GET /api/digilocker/auth/callback`: Handle OAuth callback
 *
 * **Security**:
 * - Input validation using class-validator DTOs
 * - Error handling with appropriate HTTP status codes
 * - Logging for debugging and monitoring
 *
 * **Integration**:
 * - Frontend calls `/initiate` to get authorization URL
 * - User is redirected to DigiLocker for authorization
 * - DigiLocker redirects to `/callback` with authorization code
 * - Frontend polls for completion or receives webhook notification
 */
@Controller('digilocker/auth')
export class DigiLockerAuthController {
  private readonly logger = new Logger(DigiLockerAuthController.name);

  constructor(private readonly digiLockerAuthService: DigiLockerAuthService) {}

  /**
   * Initiate DigiLocker Authorization
   *
   * Generates DigiLocker OAuth 2.0 authorization URL with PKCE.
   * Frontend should redirect user to the returned URL.
   *
   * @param query - Query parameters with userId and optional state
   * @returns Authorization URL and metadata
   *
   * @example
   * GET /api/digilocker/auth/initiate?userId=550e8400-e29b-41d4-a716-446655440000&state=custom-state
   *
   * Response:
   * {
   *   "authorizationUrl": "https://entity.digilocker.gov.in/public/oauth2/1/authorize?...",
   *   "userId": "550e8400-e29b-41d4-a716-446655440000",
   *   "message": "Redirect user to this URL to authorize DigiLocker access"
   * }
   */
  @Get('initiate')
  @HttpCode(HttpStatus.OK)
  async initiateAuth(@Query() query: InitiateAuthDto) {
    try {
      this.logger.log(`Initiating DigiLocker auth for user ${query.userId}`);

      const authorizationUrl = await this.digiLockerAuthService.generateAuthorizationUrl(
        query.userId,
        query.state
      );

      return {
        authorizationUrl,
        userId: query.userId,
        message: 'Redirect user to this URL to authorize DigiLocker access',
      };
    } catch (error) {
      this.logger.error(`Failed to initiate DigiLocker auth for user ${query.userId}`, error);

      if (error instanceof DigiLockerException) {
        throw error;
      }

      throw new DigiLockerException('Failed to initiate DigiLocker authorization', HttpStatus.INTERNAL_SERVER_ERROR, {
        userId: query.userId,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Handle DigiLocker OAuth Callback
   *
   * Processes authorization code from DigiLocker OAuth callback.
   * Exchanges code for access token and stores in database.
   *
   * @param query - Query parameters from DigiLocker callback
   * @returns Success response with token expiry information
   *
   * @example
   * GET /api/digilocker/auth/callback?code=abc123&state=user-uuid
   *
   * Response:
   * {
   *   "success": true,
   *   "userId": "550e8400-e29b-41d4-a716-446655440000",
   *   "message": "DigiLocker authorization successful",
   *   "tokenExpiry": "2026-01-15T10:30:00Z"
   * }
   */
  @Get('callback')
  @HttpCode(HttpStatus.OK)
  async handleCallback(@Query() query: CallbackDto) {
    try {
      // Check for OAuth error response
      if (query.error) {
        this.logger.warn(`DigiLocker authorization failed: ${query.error}`, {
          error: query.error,
          error_description: query.error_description,
          state: query.state,
        });

        throw new DigiLockerException(
          `DigiLocker authorization failed: ${query.error_description || query.error}`,
          this.getHttpStatusForCallbackError(query.error),
          {
            error: query.error,
            error_description: query.error_description,
            state: query.state,
          }
        );
      }

      // Validate required parameters for success case
      if (!query.code || !query.state) {
        throw new DigiLockerException(
          'Missing required parameters: code and state',
          HttpStatus.BAD_REQUEST,
          { code: query.code, state: query.state }
        );
      }

      this.logger.log(`Processing DigiLocker callback for state ${query.state}`);

      // Exchange authorization code for tokens
      const { tokenResponse, userId } = await this.digiLockerAuthService.exchangeCodeForToken(
        query.code,
        query.state
      );

      // Calculate token expiry for response
      const tokenExpiry = new Date(Date.now() + tokenResponse.expires_in * 1000);

      return {
        success: true,
        userId,
        message: 'DigiLocker authorization successful',
        tokenExpiry: tokenExpiry.toISOString(),
      };
    } catch (error) {
      this.logger.error('Failed to handle DigiLocker callback', error);

      if (error instanceof DigiLockerException) {
        throw error;
      }

      throw new DigiLockerException('Failed to process DigiLocker callback', HttpStatus.INTERNAL_SERVER_ERROR, {
        query,
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get HTTP Status for Callback Error
   *
   * Maps OAuth callback error codes to appropriate HTTP status codes.
   *
   * @private
 * @param error - OAuth error code from callback
   * @returns number - HTTP status code
   */
  private getHttpStatusForCallbackError(error: string): number {
    switch (error) {
      case 'access_denied':
        return HttpStatus.FORBIDDEN; // 403
      case 'invalid_request':
        return HttpStatus.BAD_REQUEST; // 400
      case 'unauthorized_client':
        return HttpStatus.UNAUTHORIZED; // 401
      case 'unsupported_response_type':
        return HttpStatus.BAD_REQUEST; // 400
      case 'invalid_scope':
        return HttpStatus.BAD_REQUEST; // 400
      case 'server_error':
        return HttpStatus.INTERNAL_SERVER_ERROR; // 500
      case 'temporarily_unavailable':
        return HttpStatus.SERVICE_UNAVAILABLE; // 503
      default:
        return HttpStatus.INTERNAL_SERVER_ERROR; // 500
    }
  }
}