import { IsArray, IsString } from 'class-validator';

/**
 * Update Client Domains DTO
 *
 * Validates domain whitelist update request.
 *
 * @remarks
 * **Validation Rules**:
 * - domains: Array of strings (required)
 * - Each domain: Non-empty string
 * - Minimum 0 domains (empty array allowed to disable whitelist)
 *
 * **Domain Format Examples**:
 * - Standard: "fintech.com", "api.fintech.com", "localhost:3000"
 * - Wildcard: "*.smcwealth.com" (matches sub.smcwealth.com, api.smcwealth.com)
 * - Development: "localhost:3000", "127.0.0.1:3000"
 *
 * **Backend Validation**:
 * - Format validation in AdminService.updateClientDomains()
 * - Invalid domains silently filtered (not rejected)
 * - Duplicates automatically removed
 */
export class UpdateClientDomainsDto {
  @IsArray()
  @IsString({ each: true })
  domains!: string[];
}
