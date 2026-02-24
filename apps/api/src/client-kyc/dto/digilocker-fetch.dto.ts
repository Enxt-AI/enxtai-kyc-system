import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEnum } from 'class-validator';

export class DigiLockerFetchRequestDto {
  @ApiProperty({
    description: 'Document types to fetch',
    example: ['PAN', 'AADHAAR'],
    enum: ['PAN', 'AADHAAR'],
    isArray: true
  })
  @IsArray()
  @IsEnum(['PAN', 'AADHAAR'], { each: true })
  documentTypes!: string[];
}

export class DigiLockerFetchResponseDto {
  @ApiProperty({ description: 'Fetch success status' })
  success!: boolean;

  @ApiProperty({ description: 'KYC session ID' })
  kycSessionId!: string;

  @ApiProperty({ description: 'Documents successfully fetched' })
  documentsFetched!: string[];

  @ApiProperty({ description: 'MinIO URLs for fetched documents' })
  documentUrls!: {
    panDocumentUrl?: string;
    aadhaarFrontUrl?: string;
  };

  @ApiProperty({ description: 'Processing status' })
  processingStatus!: string;
}