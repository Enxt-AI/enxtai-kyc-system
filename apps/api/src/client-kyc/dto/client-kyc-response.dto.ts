import { InternalStatus } from '@enxtai/shared-types';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Initiate KYC Response DTO
 *
 * Response for POST /v1/kyc/initiate endpoint. Contains the KYC session ID
 * and upload URLs for document submission.
 *
 * @example
 * {
 *   "kycSessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
 *   "status": "PENDING",
 *   "uploadUrls": {
 *     "pan": "/v1/kyc/upload/pan",
 *     "aadhaarFront": "/v1/kyc/upload/aadhaar/front",
 *     "aadhaarBack": "/v1/kyc/upload/aadhaar/back",
 *     "livePhoto": "/v1/kyc/upload/live-photo"
 *   }
 * }
 */
export class InitiateKycResponseDto {
  /**
   * Unique KYC session identifier (UUID)
   * Use this ID to upload documents and check status
   */
  @ApiProperty({
    description: 'Unique KYC session identifier (UUID v4)',
    example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  })
  kycSessionId!: string;

  /**
   * Current verification status
   * PENDING: Session created, awaiting documents
   */
  @ApiProperty({
    description: 'Current verification status',
    example: 'PENDING',
    enum: ['PENDING', 'DOCUMENTS_UPLOADED', 'OCR_COMPLETED', 'FACE_VERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'],
  })
  status!: InternalStatus;

  /**
   * Document upload endpoints
   * All endpoints require X-API-Key header and externalUserId in multipart form
   */
  @ApiProperty({
    description: 'Document upload endpoints (require X-API-Key header)',
    example: {
      pan: '/v1/kyc/upload/pan',
      aadhaarFront: '/v1/kyc/upload/aadhaar/front',
      aadhaarBack: '/v1/kyc/upload/aadhaar/back',
      livePhoto: '/v1/kyc/upload/live-photo',
    },
  })
  uploadUrls!: {
    pan: string;
    aadhaarFront: string;
    aadhaarBack: string;
    livePhoto: string;
  };
}

/**
 * KYC Status Response DTO
 *
 * Detailed status information for GET /v1/kyc/status/:kycSessionId endpoint.
 * Includes extracted data, verification scores, and progress tracking.
 *
 * @example
 * {
 *   "kycSessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
 *   "externalUserId": "customer-12345",
 *   "status": "FACE_VERIFIED",
 *   "progress": 100,
 *   "extractedData": {
 *     "panNumber": "ABCDE1234F",
 *     "aadhaarNumber": "1234 5678 9012",
 *     "fullName": "JOHN DOE",
 *     "dateOfBirth": "01/01/1990",
 *     "address": "123 Main St, Mumbai, MH 400001"
 *   },
 *   "verificationScores": {
 *     "faceMatchScore": 0.95,
 *     "livenessScore": 0.88
 *   },
 *   "createdAt": "2026-01-05T10:30:00Z",
 *   "updatedAt": "2026-01-05T10:45:00Z"
 * }
 */
export class KycStatusResponseDto {
  /**
   * KYC session identifier
   */
  @ApiProperty({ description: 'KYC session identifier', example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' })
  kycSessionId!: string;

  /**
   * Client's user identifier (matches externalUserId from initiate request)
   */
  @ApiProperty({ description: "Client's user identifier", example: 'customer-12345' })
  externalUserId!: string;

  /**
   * Current verification status
   * - PENDING: Session created, no documents uploaded
   * - DOCUMENTS_UPLOADED: All documents received, awaiting OCR
   * - OCR_COMPLETED: Text extraction complete, awaiting face verification
   * - FACE_VERIFIED: All verifications passed
   * - MANUAL_REVIEW: Confidence below threshold, needs admin review
   * - APPROVED: Admin approved (manual review path)
   * - REJECTED: Admin rejected or verification failed
   */
  @ApiProperty({
    description: 'Current verification status',
    enum: ['PENDING', 'DOCUMENTS_UPLOADED', 'OCR_COMPLETED', 'FACE_VERIFIED', 'PENDING_REVIEW', 'VERIFIED', 'REJECTED'],
  })
  status!: InternalStatus;

  /**
   * Completion progress (0-100)
   * Calculated based on uploaded documents and verification steps
   */
  @ApiProperty({ description: 'Completion progress (0-100)', example: 66, minimum: 0, maximum: 100 })
  progress!: number;

  /**
   * Extracted identity data from documents
   * Null if OCR not yet completed
   */
  @ApiProperty({
    description: 'Extracted identity data from documents (null if OCR not completed)',
    nullable: true,
    example: {
      panNumber: 'ABCDE1234F',
      aadhaarNumber: 'XXXX XXXX 1234',
      fullName: 'JOHN DOE',
      dateOfBirth: '1990-01-15',
      address: '123 Main St, Mumbai, MH 400001',
    },
  })
  extractedData!: {
    panNumber?: string;
    aadhaarNumber?: string;
    fullName?: string;
    dateOfBirth?: string;
    address?: string;
  } | null;

  /**
   * Biometric verification scores
   * Null if face verification not yet performed
   */
  @ApiProperty({
    description: 'Biometric verification scores (null if verification not performed)',
    nullable: true,
    example: { faceMatchScore: 0.95, livenessScore: 0.88 },
  })
  verificationScores!: {
    faceMatchScore?: number; // 0.0 to 1.0
    livenessScore?: number; // 0.0 to 1.0
  } | null;

  /**
   * Session creation timestamp (ISO 8601)
   */
  @ApiProperty({ description: 'Session creation timestamp (ISO 8601)', example: '2026-01-05T10:30:00Z' })
  createdAt!: string;

  /**
   * Last update timestamp (ISO 8601)
   */
  @ApiProperty({ description: 'Last update timestamp (ISO 8601)', example: '2026-01-05T10:45:00Z' })
  updatedAt!: string;
}

/**
 * Upload Response DTO
 *
 * Standard response for all document upload endpoints.
 *
 * @example
 * {
 *   "success": true,
 *   "kycSessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
 *   "documentUrl": "kyc-abc123-pan/user-uuid/PAN_CARD_1735987654321.jpg"
 * }
 */
export class UploadResponseDto {
  /**
   * Upload success indicator
   */
  @ApiProperty({ description: 'Upload success indicator', example: true })
  success!: boolean;

  /**
   * KYC session identifier
   */
  @ApiProperty({ description: 'KYC session identifier', example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' })
  kycSessionId!: string;

  /**
   * MinIO object path for uploaded document
   */
  @ApiProperty({
    description: 'MinIO object path for uploaded document',
    example: 'kyc-abc123-pan/user-uuid/PAN_CARD_1735987654321.jpg',
  })
  documentUrl!: string;
}
