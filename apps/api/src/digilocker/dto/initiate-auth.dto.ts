import { IsUUID, IsOptional, IsString } from 'class-validator';

/**
 * Initiate DigiLocker Auth DTO
 *
 * Request body for initiating DigiLocker OAuth 2.0 authorization flow.
 *
 * @remarks
 * **Required Fields**:
 * - userId: UUID of the user initiating DigiLocker authorization
 *
 * **Optional Fields**:
 * - state: Custom state parameter for OAuth flow (defaults to userId if not provided)
 *
 * @example
 * ```json
 * {
 *   "userId": "550e8400-e29b-41d4-a716-446655440000",
 *   "state": "custom-state-value"
 * }
 * ```
 */
export class InitiateAuthDto {
  @IsUUID('4', { message: 'userId must be a valid UUID' })
  userId!: string;

  @IsOptional()
  @IsString({ message: 'state must be a string' })
  state?: string;
}