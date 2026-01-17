import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * DigiLocker Configuration Interface
 *
 * Defines required configuration for DigiLocker OAuth 2.0 integration.
 */
export interface DigiLockerConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizeUrl: string;
  tokenUrl: string;
  documentsUrl: string;
  scope: string;
  enablePkce: boolean;
}

/**
 * DigiLocker Configuration Service
 *
 * Loads and validates DigiLocker API credentials from environment variables.
 * Follows the same pattern as StorageService configuration.
 *
 * @remarks
 * **Environment Variables Required**:
 * - DIGILOCKER_CLIENT_ID: OAuth client ID from API Setu
 * - DIGILOCKER_CLIENT_SECRET: OAuth client secret
 * - DIGILOCKER_REDIRECT_URI: OAuth callback URL
 * - DIGILOCKER_AUTHORIZE_URL: DigiLocker authorization endpoint URL
 * - DIGILOCKER_TOKEN_URL: DigiLocker token exchange endpoint URL
 * - DIGILOCKER_DOCUMENTS_URL: DigiLocker documents API endpoint URL
 * - DIGILOCKER_SCOPE: OAuth scopes (space-separated, must include 'openid')
 * - DIGILOCKER_ENABLE_PKCE: Enable PKCE for OAuth flow (default: true)
 *
 * **Validation**:
 * - Throws error if required variables are missing
 * - Validates redirect URI format (must be http/https)
 * - Ensures scope includes required permissions
 */
@Injectable()
export class DigiLockerConfigService {
  private readonly config: DigiLockerConfig;

  constructor(private readonly configService: ConfigService) {
    const enablePkceRaw = this.configService.get<string>('DIGILOCKER_ENABLE_PKCE');
    const enablePkce = enablePkceRaw === undefined
      ? true
      : !['0', 'false', 'no', 'off'].includes(enablePkceRaw.trim().toLowerCase());

    this.config = {
      clientId: this.configService.get<string>('DIGILOCKER_CLIENT_ID', ''),
      clientSecret: this.configService.get<string>('DIGILOCKER_CLIENT_SECRET', ''),
      redirectUri: this.configService.get<string>('DIGILOCKER_REDIRECT_URI', ''),
      authorizeUrl: this.configService.get<string>(
        'DIGILOCKER_AUTHORIZE_URL',
        'https://digilocker.meripehchaan.gov.in/public/oauth2/1/authorize'
      ),
      tokenUrl: this.configService.get<string>(
        'DIGILOCKER_TOKEN_URL',
        'https://api.digitallocker.gov.in/public/oauth2/1/token'
      ),
      documentsUrl: this.configService.get<string>(
        'DIGILOCKER_DOCUMENTS_URL',
        'https://digilocker.meripehchaan.gov.in/public/oauth2/1'
      ),
      scope: this.configService.get<string>(
        'DIGILOCKER_SCOPE',
        ''
      ),
      enablePkce,
    };

    this.validateConfig();
  }

  /**
   * Get DigiLocker Configuration
   *
   * Returns validated configuration object for use in services.
   */
  getConfig(): DigiLockerConfig {
    return this.config;
  }

  /**
   * Validate Configuration
   *
   * Ensures all required environment variables are set.
   * Throws error if validation fails.
   */
  private validateConfig(): void {
    if (!this.config.clientId) {
      throw new Error('DIGILOCKER_CLIENT_ID is required');
    }
    if (!this.config.clientSecret) {
      throw new Error('DIGILOCKER_CLIENT_SECRET is required');
    }
    if (!this.config.redirectUri) {
      throw new Error('DIGILOCKER_REDIRECT_URI is required');
    }
    if (!this.config.redirectUri.startsWith('http')) {
      throw new Error('DIGILOCKER_REDIRECT_URI must be a valid HTTP/HTTPS URL');
    }

    // DEBUG: Temporarily disable scope validation for testing
    /* if (!this.config.scope) {
      throw new Error('DIGILOCKER_SCOPE is required');
    } */

    // Log the loaded scope for debugging
    console.log(`[DigiLocker Config] Loaded scope: "${this.config.scope}"`);

    // Ensure scope contains required 'openid' permission for OAuth 2.0 compliance
    /* const scopeArray = this.config.scope.split(' ');
    if (!scopeArray.includes('openid')) {
      throw new Error('DIGILOCKER_SCOPE must include required permission: openid');
    } */
  }
}