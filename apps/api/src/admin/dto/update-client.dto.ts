import { IsString, IsEnum, IsOptional, MinLength } from 'class-validator';

/**
 * Update Client DTO
 * 
 * Validates input for updating client details.
 * 
 * @remarks
 * **Allowed Updates**:
 * - name: Organization name
 * - status: ACTIVE, SUSPENDED, TRIAL (admin can suspend clients)
 * 
 * **Not Allowed**:
 * - API key: Use separate regenerate endpoint
 * - Webhook config: Clients manage via their portal
 * 
 * **Use Cases**:
 * - Rename organization
 * - Suspend client (billing issues, policy violations)
 * - Reactivate suspended client
 * - Change trial status to active
 */
export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name?: string;

  @IsOptional()
  @IsEnum(['ACTIVE', 'SUSPENDED', 'TRIAL'])
  status?: 'ACTIVE' | 'SUSPENDED' | 'TRIAL';
}
