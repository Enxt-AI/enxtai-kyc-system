import { IsString, IsOptional, IsUrl, MinLength } from 'class-validator';

/**
 * Create Client DTO
 *
 * Validates input for creating a new client organization. Used by super admin
 * during client onboarding process.
 *
 * @remarks
 * - Name is required (organization name like "SMC Private Wealth")
 * - Webhook URL is optional (can be configured later in client portal)
 * - Webhook secret is optional (auto-generated if not provided)
 * - API key is auto-generated (not part of DTO)
 */
export class CreateClientDto {
  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  webhookUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(16)
  webhookSecret?: string;
}
