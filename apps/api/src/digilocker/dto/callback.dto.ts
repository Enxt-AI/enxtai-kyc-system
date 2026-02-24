import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

/**
 * DigiLocker OAuth Callback DTO
 *
 * Query parameters received from DigiLocker OAuth callback.
 *
 * @remarks
 * **Success Response**:
 * - code: Authorization code to exchange for access token
 * - state: State parameter passed during authorization
 *
 * **Error Response**:
 * - error: Error code (e.g., "access_denied")
 * - error_description: Human-readable error message
 *
 * @example
 * Success: ?code=abc123&state=user-uuid
 * Error: ?error=access_denied&error_description=User+denied+access
 */
export class CallbackDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  error_description?: string;
}