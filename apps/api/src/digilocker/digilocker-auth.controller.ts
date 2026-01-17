import { Controller, Post, Get, Body, Query, HttpCode, HttpStatus, Logger, Req, Res } from '@nestjs/common';
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
  async handleCallback(
    @Query() query: CallbackDto,
    @Req() req: any,
    @Res() reply: any,
  ) {
    try {
      const acceptHeader = (req?.headers?.accept as string | undefined) || '';
      const wantsHtml = acceptHeader.includes('text/html');

      // Check for OAuth error response
      if (query.error) {
        this.logger.warn(`DigiLocker authorization failed: ${query.error}`, {
          error: query.error,
          error_description: query.error_description,
          state: query.state,
        });

        if (wantsHtml) {
          const payload = {
            type: 'digilocker_auth_error',
            error: query.error_description || query.error,
            state: query.state,
          };

          return reply
            .type('text/html; charset=utf-8')
            .send(this.buildPopupCallbackHtml(false, payload));
        }

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
        if (wantsHtml) {
          const payload = {
            type: 'digilocker_auth_error',
            error: 'Missing required parameters: code and state',
            state: query.state,
          };

          return reply
            .type('text/html; charset=utf-8')
            .send(this.buildPopupCallbackHtml(false, payload));
        }

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

      if (wantsHtml) {
        const payload = {
          type: 'digilocker_auth_success',
          userId,
          state: query.state,
          tokenExpiry: tokenExpiry.toISOString(),
        };

        return reply
          .type('text/html; charset=utf-8')
          .send(this.buildPopupCallbackHtml(true, payload));
      }

      return reply.send({
        success: true,
        userId,
        message: 'DigiLocker authorization successful',
        tokenExpiry: tokenExpiry.toISOString(),
      });
    } catch (error) {
      this.logger.error('Failed to handle DigiLocker callback', error);

      const acceptHeader = (req?.headers?.accept as string | undefined) || '';
      const wantsHtml = acceptHeader.includes('text/html');

      if (wantsHtml) {
        const payload = {
          type: 'digilocker_auth_error',
          error: (error as Error)?.message || 'Failed to process DigiLocker callback',
          state: query?.state,
        };

        return reply
          .type('text/html; charset=utf-8')
          .send(this.buildPopupCallbackHtml(false, payload));
      }

      if (error instanceof DigiLockerException) {
        throw error;
      }

      throw new DigiLockerException('Failed to process DigiLocker callback', HttpStatus.INTERNAL_SERVER_ERROR, {
        query,
        error: (error as Error).message,
      });
    }
  }

  private buildPopupCallbackHtml(success: boolean, payload: Record<string, any>) {
    const safePayload = JSON.stringify(payload);
    const title = success ? 'DigiLocker Authorized' : 'DigiLocker Authorization Failed';
    const message = success
      ? 'Authorization completed. You can close this window.'
      : 'Authorization failed. You can close this window.';

    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px;">
    <h2 style="margin: 0 0 8px;">${title}</h2>
    <p style="margin: 0 0 16px; color: #334155;">${message}</p>
    <script>
      (function () {
        try {
          var payload = ${safePayload};
          if (window.opener && typeof window.opener.postMessage === 'function') {
            window.opener.postMessage(payload, '*');
          }
        } catch (e) {}
        try { window.close(); } catch (e) {}
      })();
    </script>
  </body>
</html>`;
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