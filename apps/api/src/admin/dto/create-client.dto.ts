import { IsString, IsEmail, IsOptional, IsUrl, MinLength, IsArray } from 'class-validator';

/**
 * Create Client DTO
 *
 * Validates input for creating a new client organization.
 *
 * @remarks
 * **Validation Rules**:
 * - name: Required, min 2 characters (organization name)
 * - email: Required, valid email format (for default admin clientUser)
 * - webhookUrl: Optional, must be HTTPS URL if provided
 * - webhookSecret: Optional, min 16 characters if provided
 *
 * **Onboarding Flow**:
 * 1. Validate input via class-validator decorators
 * 2. Generate API key (SHA-256 hash + plaintext)
 * 3. Create Client record in database
 * 4. Create MinIO buckets via StorageService.createClientBuckets()
 * 5. Generate temporary password for default admin clientUser
 * 6. Create User record (bcrypt hash password)
 * 7. Return plaintext API key and password (show once)
 *
 * **Security**:
 * - Webhook URL must be HTTPS (enforced by @IsUrl)
 * - Webhook secret min 16 chars (HMAC security)
 * - Default admin password auto-generated (16 chars, alphanumeric)
 */
export class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string; // Organization name (e.g., "SMC Private Wealth")

  @IsEmail()
  email!: string; // Email for default admin clientUser

  @IsOptional()
  @IsUrl({ protocols: ['https', 'http'], require_protocol: true, require_tld: false })
  webhookUrl?: string; // Optional webhook endpoint

  @IsOptional()
  @MinLength(16)
  webhookSecret?: string; // Optional webhook secret

  /**
   * Allowed domains for API key usage (CORS/origin validation).
   *
   * Domain whitelist enforced by TenantMiddleware. Supports:
   * - Exact match: 'smc-app.com'
   * - Wildcard subdomains: '*.smc-app.com' (matches api.smc-app.com, admin.smc-app.com)
   * - Localhost for dev: 'localhost:3000'
   *
   * If omitted or empty, all domains are allowed (backward compatibility).
   *
   * @example ['smc-app.com', '*.smc-app.com', 'localhost:3000']
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedDomains?: string[];
}
