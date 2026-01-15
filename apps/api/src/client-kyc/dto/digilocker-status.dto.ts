import { ApiProperty } from '@nestjs/swagger';
import { KycStatusResponseDto } from './client-kyc-response.dto';

export class DigiLockerStatusResponseDto {
  @ApiProperty({ description: 'DigiLocker authorization status' })
  authorized!: boolean;

  @ApiProperty({ description: 'Documents fetched from DigiLocker' })
  documentsFetched!: boolean;

  @ApiProperty({ description: 'Document source' })
  documentSource!: 'MANUAL_UPLOAD' | 'DIGILOCKER';

  @ApiProperty({ description: 'Available documents in DigiLocker' })
  availableDocuments!: string[];

  @ApiProperty({ description: 'KYC submission details' })
  submission!: KycStatusResponseDto | null;
}