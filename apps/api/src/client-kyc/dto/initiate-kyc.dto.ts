import { IsString, IsNotEmpty, IsEmail, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Initiate KYC Request DTO
 *
 * Request payload for POST /v1/kyc/initiate endpoint. Clients use this to start
 * a new KYC verification session for one of their end-users.
 *
 * **External User ID Strategy:**
 * - `externalUserId` is the client's own user identifier from their system
 * - Examples: "user-123", "customer-abc-456", "merchant-xyz"
 * - Must be unique within the client's organization (enforced by composite key)
 * - Allows clients to reference users without exposing internal UUIDs
 *
 * **Optional Fields:**
 * - `email` and `phone` can be provided for pre-filling user data
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
   * Client's own user identifier (e.g., "user-123" from their system)
   * Must be unique within the client's organization
   */
  @ApiProperty({
    description: "Client's own user identifier (must be unique within client organization)",
    example: 'customer-12345',
    type: String,
  })
  @IsString()
  @IsNotEmpty()
  externalUserId!: string;

  /**
   * User's email address (optional)
   * If omitted, a temporary email will be generated
   */
  @ApiPropertyOptional({
    description: "User's email address (optional, temporary email generated if omitted)",
    example: 'john.doe@example.com',
    type: String,
  })
  @IsEmail()
  @IsOptional()
  email?: string;

  /**
   * User's phone number (optional, Indian format)
   * If omitted, a temporary phone will be generated
   */
  @ApiPropertyOptional({
    description: "User's phone number in Indian format (optional)",
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
}
