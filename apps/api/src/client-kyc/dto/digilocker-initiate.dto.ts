import { ApiProperty } from '@nestjs/swagger';

export class DigiLockerInitiateResponseDto {
  @ApiProperty({ description: 'DigiLocker OAuth authorization URL' })
  authorizationUrl!: string;

  @ApiProperty({ description: 'Instructions for clientUser' })
  instructions!: string;

  @ApiProperty({ description: 'URL expiry time in seconds' })
  expiresIn!: number;
}