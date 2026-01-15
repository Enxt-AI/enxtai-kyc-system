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
  apiBaseUrl: string;
  scope: string;
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
 * - DIGILOCKER_API_BASE_URL: DigiLocker API base URL
 * - DIGILOCKER_SCOPE: OAuth scopes (space-separated)
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
    this.config = {
      clientId: this.configService.get<string>('DIGILOCKER_CLIENT_ID', ''),
      clientSecret: this.configService.get<string>('DIGILOCKER_CLIENT_SECRET', ''),
      redirectUri: this.configService.get<string>('DIGILOCKER_REDIRECT_URI', ''),
      apiBaseUrl: this.configService.get<string>(
        'DIGILOCKER_API_BASE_URL',
        'https://api.digitallocker.gov.in/public/oauth2/1'
      ),
      scope: this.configService.get<string>(
        'DIGILOCKER_SCOPE',
        'openid profile aadhaar pan'
      ),
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
    if (!this.config.scope) {
      throw new Error('DIGILOCKER_SCOPE is required');
    }
    // Ensure scope contains required permissions for DigiLocker integration
    const requiredScopes = ['openid', 'profile', 'aadhaar', 'pan'];
    const scopeArray = this.config.scope.split(' ');
    const missingScopes = requiredScopes.filter(scope => !scopeArray.includes(scope));
    if (missingScopes.length > 0) {
      throw new Error(`DIGILOCKER_SCOPE must include required permissions: ${missingScopes.join(', ')}`);
    }
  }
}