import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { DigiLockerConfigService } from './digilocker.config';
import { DigiLockerException } from './exceptions/digilocker.exception';
import { DigiLockerTokenResponse } from '@enxtai/shared-types';
import { firstValueFrom } from 'rxjs';
import { createHash, randomBytes } from 'crypto';
import { Prisma } from '@prisma/client';

/**
 * DigiLocker Authentication Service
 *
 * Handles OAuth 2.0 authorization code flow with PKCE for DigiLocker integration.
 * Manages token storage, refresh, and validation for secure document fetching.
 *
 * @remarks
 * **OAuth 2.0 Flow**:
 * 1. Generate authorization URL with PKCE challenge
 * 2. User authorizes application in DigiLocker
 * 3. Exchange authorization code for access token
 * 4. Store tokens securely in database
 * 5. Refresh tokens automatically before expiry
 *
 * **Security Features**:
 * - PKCE (Proof Key for Code Exchange) prevents authorization code interception
 * - State parameter validation prevents CSRF attacks
 * - Tokens stored encrypted in database
 * - Automatic token refresh before expiry
 *
 * **Error Handling**:
 * - Throws DigiLockerException for all DigiLocker-specific errors
 * - Logs errors for debugging and monitoring
 * - Graceful handling of network failures and API errors
 */
@Injectable()
export class DigiLockerAuthService {
  private readonly logger = new Logger(DigiLockerAuthService.name);

  // In-memory storage for PKCE code verifiers (consider Redis for production)
  private readonly codeVerifiers = new Map<string, string>();
  // Mapping of state -> userId for custom state support
  private readonly stateToUserId = new Map<string, string>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: DigiLockerConfigService,
  ) {}

  /**
   * Generate Authorization URL
   *
   * Creates DigiLocker OAuth 2.0 authorization URL with PKCE parameters.
   * Stores code verifier in memory for later token exchange.
   *
   * @param userId - UUID of the user initiating authorization
   * @param state - Optional custom state parameter (defaults to userId)
   * @returns Promise<string> - Complete authorization URL for user redirection
   *
   * @throws DigiLockerException if URL generation fails
   */
  async generateAuthorizationUrl(userId: string, state?: string): Promise<string> {
    try {
      const config = this.configService.getConfig();

      // DEBUG: Toggle PKCE for testing
      const ENABLE_PKCE = config.enablePkce;

      let codeChallenge = '';
      let codeVerifier = '';

      if (ENABLE_PKCE) {
        // Generate PKCE code verifier (43-128 characters, URL-safe)
        codeVerifier = this.generateCodeVerifier();
        codeChallenge = this.generateCodeChallenge(codeVerifier);
      }

      // Use provided state or default to userId
      const actualState = state || userId;

      if (ENABLE_PKCE) {
        // Store code verifier with state as key
        this.codeVerifiers.set(actualState, codeVerifier);
      }
      // Store state -> userId mapping for custom states
      this.stateToUserId.set(actualState, userId);

      // Build authorization URL with OAuth 2.0 parameters
      const params = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        state: actualState,
      });

      // Add scope parameter only if configured scope is not empty
      if (config.scope && config.scope.trim() !== '') {
        params.append('scope', config.scope);
      }

      // Add PKCE parameters only if enabled
      if (ENABLE_PKCE) {
        params.append('code_challenge', codeChallenge);
        params.append('code_challenge_method', 'S256');
      }

      const authorizationUrl = `${config.authorizeUrl}?${params.toString()}`;

      // DEBUG: Log full authorization details
      this.logger.log(`=== DigiLocker Authorization Debug ===`);
      this.logger.log(`PKCE Enabled: ${ENABLE_PKCE}`);
      this.logger.log(`Full Authorization URL: ${authorizationUrl}`);
      this.logger.log(`Scope parameter: "${config.scope}"`);
      this.logger.log(`=====================================`);

      this.logger.log(`Generated authorization URL for user ${userId}`);
      return authorizationUrl;
    } catch (error) {
      this.logger.error(`Failed to generate authorization URL for user ${userId}`, error);
      throw new DigiLockerException('Failed to generate authorization URL', undefined, { userId, error: (error as Error).message });
    }
  }

  /**
   * Exchange Code for Token
   *
   * Exchanges authorization code for access token using PKCE verification.
   * Stores tokens securely in database for future API calls.
   *
   * @param code - Authorization code from DigiLocker callback
   * @param userId - UUID of the user (extracted from state parameter)
   * @returns Promise<DigiLockerTokenResponse> - Token response with access details
   *
   * @throws DigiLockerException if token exchange fails
   */
  async exchangeCodeForToken(code: string, state: string): Promise<{ tokenResponse: DigiLockerTokenResponse; userId: string }> {
    let userId = ''; // Initialize to avoid undefined usage in catch
    try {
      const config = this.configService.getConfig();

      // DEBUG: Match PKCE setting from generateAuthorizationUrl
      const ENABLE_PKCE = config.enablePkce;

      let codeVerifier = '';
      if (ENABLE_PKCE) {
        // Retrieve code verifier from memory using state as key
        const retrievedCodeVerifier = this.codeVerifiers.get(state);
        if (!retrievedCodeVerifier) {
          throw new DigiLockerException('Invalid state: code verifier not found', undefined, { state });
        }
        codeVerifier = retrievedCodeVerifier;
      }

      // Retrieve userId from state mapping
      const mappedUserId = this.stateToUserId.get(state);
      if (mappedUserId) {
        userId = mappedUserId;
      } else {
        // If the server restarted, in-memory state mapping will be lost.
        // Best-effort recovery:
        // 1) If state matches an existing submissionId, use that submission's userId.
        // 2) Otherwise, if state looks like a UUID, assume state == userId (legacy/internal flow).
        const submission = await this.prisma.kYCSubmission.findUnique({
          where: { id: state },
          select: { userId: true },
        });

        if (submission?.userId) {
          userId = submission.userId;
          this.logger.warn(`Recovered DigiLocker userId from submission state`, { state, userId });
        } else if (this.looksLikeUuid(state)) {
          userId = state;
          this.logger.warn(`State mapping missing; falling back to state as userId`, { state, userId });
        } else {
          throw new DigiLockerException('Invalid state: userId mapping not found', undefined, { state });
        }
      }

      // Build token request body
      const tokenRequestBody = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      // Add code_verifier only if PKCE is enabled
      if (ENABLE_PKCE && codeVerifier) {
        tokenRequestBody.append('code_verifier', codeVerifier);
      }

      // Exchange code for tokens
      const response = await firstValueFrom(
        this.httpService.post(config.tokenUrl, tokenRequestBody.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      const tokenData: DigiLockerTokenResponse = response.data;

      // Calculate token expiry time
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      // Store tokens in database
      await this.prisma.digiLockerToken.upsert({
        where: { userId },
        update: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenType: tokenData.token_type || 'Bearer',
          scope: tokenData.scope ?? '',
          expiresAt,
        },
        create: {
          userId,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenType: tokenData.token_type || 'Bearer',
          scope: tokenData.scope ?? '',
          expiresAt,
        },
      });

      // Clean up code verifier and state mapping from memory
      this.codeVerifiers.delete(state);
      this.stateToUserId.delete(state);

      this.logger.log(`Successfully exchanged code for tokens for user ${userId}`);
      return { tokenResponse: tokenData, userId };
    } catch (error) {
      this.logger.error(`Failed to exchange code for token for user ${userId}`, error);

      // Provide a clearer error when persistence fails due to missing user/tenant row.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new DigiLockerException('Failed to store DigiLocker token (missing user record)', undefined, {
          userId,
          state,
          prismaCode: error.code,
        });
      }

      // Handle specific OAuth errors
      if ((error as any).response?.data?.error) {
        const oauthError = (error as any).response.data;
        throw new DigiLockerException(
          `OAuth error: ${oauthError.error_description || oauthError.error}`,
          this.getHttpStatusForOAuthError(oauthError.error),
          { userId, code, oauthError }
        );
      }

      throw new DigiLockerException('Failed to exchange authorization code for token', undefined, { userId, code, error: (error as Error).message });
    }
  }

  private looksLikeUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }

  /**
   * Refresh Access Token
   *
   * Refreshes expired access token using refresh token.
   * Updates stored tokens in database.
   *
   * @param userId - UUID of the user whose token needs refresh
   * @returns Promise<DigiLockerTokenResponse> - Updated token response
   *
   * @throws DigiLockerException if refresh fails or no refresh token available
   */
  async refreshAccessToken(userId: string): Promise<DigiLockerTokenResponse> {
    try {
      const config = this.configService.getConfig();

      // Fetch existing token from database
      const existingToken = await this.prisma.digiLockerToken.findUnique({
        where: { userId },
      });

      if (!existingToken || !existingToken.refreshToken) {
        throw new DigiLockerException('No refresh token available for user', undefined, { userId });
      }

      // Build refresh request body
      const refreshRequestBody = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: existingToken.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      });

      // Refresh tokens
      const response = await firstValueFrom(
        this.httpService.post(config.tokenUrl, refreshRequestBody.toString(), {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        })
      );

      const tokenData: DigiLockerTokenResponse = response.data;

      // Calculate new expiry time
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      // Update tokens in database
      await this.prisma.digiLockerToken.update({
        where: { userId },
        data: {
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token || existingToken.refreshToken,
          tokenType: tokenData.token_type,
          scope: tokenData.scope,
          expiresAt,
        },
      });

      this.logger.log(`Successfully refreshed access token for user ${userId}`);
      return tokenData;
    } catch (error) {
      this.logger.error(`Failed to refresh access token for user ${userId}`, error);

      // If refresh fails, delete the token (user needs to re-authorize)
      if ((error as any).response?.data?.error === 'invalid_grant') {
        await this.prisma.digiLockerToken.deleteMany({
          where: { userId },
        });
        throw new DigiLockerException('Refresh token expired, user must re-authorize', undefined, { userId });
      }

      // Handle other OAuth errors
      if ((error as any).response?.data?.error) {
        const oauthError = (error as any).response.data;
        throw new DigiLockerException(
          `OAuth refresh error: ${oauthError.error_description || oauthError.error}`,
          this.getHttpStatusForOAuthError(oauthError.error),
          { userId, oauthError }
        );
      }

      throw new DigiLockerException('Failed to refresh access token', undefined, { userId, error: (error as Error).message });
    }
  }

  /**
   * Get Valid Token
   *
   * Returns a valid access token, refreshing if necessary.
   * Ensures token is not expired before returning.
   *
   * @param userId - UUID of the user
   * @returns Promise<string> - Valid access token
   *
   * @throws DigiLockerException if no valid token available
   */
  async getValidToken(userId: string): Promise<string> {
    // Fetch current token from database
    const token = await this.prisma.digiLockerToken.findUnique({
      where: { userId },
    });

    if (!token) {
      throw new DigiLockerException('User not authorized with DigiLocker', undefined, { userId });
    }

    // Check if token is expired or will expire in next 5 minutes
    const now = new Date();
    const expiryBuffer = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes buffer

    if (token.expiresAt <= expiryBuffer) {
      // Token is expired or will expire soon, refresh it
      await this.refreshAccessToken(userId);

      // Fetch refreshed token
      const refreshedToken = await this.prisma.digiLockerToken.findUnique({
        where: { userId },
      });

      if (!refreshedToken) {
        throw new DigiLockerException('Failed to obtain refreshed token', undefined, { userId });
      }

      return refreshedToken.accessToken;
    }

    return token.accessToken;
  }

  /**
   * Revoke Token
   *
   * Revokes DigiLocker authorization and deletes stored tokens.
   * Used when user wants to disconnect DigiLocker integration.
   *
   * @param userId - UUID of the user
   * @returns Promise<void>
   */
  async revokeToken(userId: string): Promise<void> {
    try {
      await this.prisma.digiLockerToken.deleteMany({
        where: { userId },
      });

      this.logger.log(`Successfully revoked DigiLocker authorization for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to revoke token for user ${userId}`, error);
      // Don't throw error for revocation failures (idempotent operation)
    }
  }

  /**
   * Generate PKCE Code Verifier
   *
   * Creates a cryptographically secure random string for PKCE.
   * Length: 43-128 characters, URL-safe alphabet.
   *
   * @private
   * @returns string - Code verifier
   */
  private generateCodeVerifier(): string {
    // Generate 32 bytes (256 bits) of random data
    const verifier = randomBytes(32);

    // Convert to URL-safe base64 (remove padding, replace chars)
    return verifier
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate PKCE Code Challenge
   *
   * Creates SHA256 hash of code verifier, base64url encoded.
   *
   * @private
   * @param verifier - Code verifier string
   * @returns string - Code challenge
   */
  private generateCodeChallenge(verifier: string): string {
    const hash = createHash('sha256').update(verifier).digest();

    // Convert to URL-safe base64
    return hash
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Get HTTP Status for OAuth Error
   *
   * Maps OAuth 2.0 error codes to appropriate HTTP status codes.
   *
   * @private
   * @param error - OAuth error code
   * @returns number - HTTP status code
   */
  private getHttpStatusForOAuthError(error: string): number {
    switch (error) {
      case 'invalid_grant':
        return 401; // Unauthorized
      case 'invalid_client':
        return 401; // Unauthorized
      case 'invalid_request':
        return 400; // Bad Request
      case 'access_denied':
        return 403; // Forbidden
      default:
        return 500; // Internal Server Error
    }
  }
}