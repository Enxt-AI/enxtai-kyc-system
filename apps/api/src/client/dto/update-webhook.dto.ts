import { IsString, IsUrl, MinLength } from 'class-validator';

/**
 * Update Webhook DTO
 *
 * Validates input for updating client webhook configuration. Used by client
 * portal settings page.
 *
 * @remarks
 * - Webhook URL must be HTTPS (TLS required for security)
 * - Webhook secret must be at least 16 characters
 * - Both fields are required (use empty string to clear)
 */
export class UpdateWebhookDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  webhookUrl!: string;

  @IsString()
  @MinLength(16)
  webhookSecret!: string;
}
