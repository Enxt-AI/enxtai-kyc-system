import { IsString, IsNotEmpty, IsEmail, IsOptional, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Initiate KYC Request DTO
 *
 * Request payload for POST /v1/kyc/initiate endpoint. Clients use this to start
 * a new KYC verification session for one of their end-clientUsers.
 *
 * **External ClientUser ID Strategy:**
 * - `externalUserId` is the client's own clientUser identifier from their system
 * - Examples: "clientUser-123", "customer-abc-456", "merchant-xyz"
 * - Must be unique within the client's organization (enforced by composite key)
 * - Allows clients to reference clientUsers without exposing internal UUIDs
 *
 * **Optional Fields:**
 * - `email` and `phone` can be provided for pre-filling clientUser data
 * - If omitted, temporary placeholders will be generated
 * - `metadata` allows clients to store custom context (e.g., transaction ID, referral source)
 *
 * @example
 * {
 *   "externalUserId": "customer-12345",
 *   "email": "john.doe@example.com",
 *   "phone": "+919876543210",
 *   "metadata": {
 *     "transactionId": "txn-abc-123",
 *     "source": "mobile-app"
 *   }
 * }
 */
export class InitiateKycDto {
  /**
   * Client's own clientUser identifier (e.g., "clientUser-123" from their system)
   * Must be unique within the client's organization
   */
  @ApiProperty({
    description: "Client's own clientUser identifier (must be unique within client organization)",
    example: 'customer-12345',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  externalUserId!: string;

  /**
   * ClientUser's email address (optional)
   * If omitted, a temporary email will be generated
   */
  @ApiPropertyOptional({
    description: "ClientUser's email address (optional, temporary email generated if omitted)",
    example: 'john.doe@example.com',
    type: String,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  /**
   * ClientUser's phone number (optional, Indian format)
   * If omitted, a temporary phone will be generated
   */
  @ApiPropertyOptional({
    description: "ClientUser's phone number in Indian format (optional)",
    example: '+919876543210',
    type: String,
  })
  @IsString()
  @IsOptional()
  phone?: string;

  /**
   * Custom metadata for client-specific context
   * Examples: transaction ID, referral source, campaign ID
   */
  @ApiPropertyOptional({
    description: 'Custom metadata for client-specific context (e.g., transaction ID, source)',
    example: { transactionId: 'txn-abc-123', source: 'mobile-app' },
    type: 'object',
  })
  @IsOptional()
  metadata?: Record<string, any>;

  /**
   * Return URL for redirect after KYC flow completion or cancellation.
   *
   * After the clientUser completes the KYC flow on the EnxtAI frontend, they are
   * redirected back to this URL with query parameters indicating the outcome:
   * - Completion: {returnUrl}?status=submitted&sessionId={kycSessionId}
   * - Cancellation: {returnUrl}?status=cancelled
   *
   * If omitted, the clientUser sees the default EnxtAI KYC completion page instead
   * of being redirected.
   *
   * @example 'https://smc-app.com/kyc'
   */
  @ApiPropertyOptional({
    description: 'URL to redirect the clientUser to after KYC completion or cancellation',
    example: 'https://smc-app.com/kyc',
    type: String,
  })
  @IsUrl(
    { protocols: ['https', 'http'], require_protocol: true, require_tld: false },
    { message: 'returnUrl must be a valid URL with protocol (https:// or http://)' },
  )
  @IsOptional()
  returnUrl?: string;
}
