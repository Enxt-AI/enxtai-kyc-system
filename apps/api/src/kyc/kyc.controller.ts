import {
  Body,
  Controller,
  Get,
  BadRequestException,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Logger,
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { KycService } from './kyc.service';
import { CreateKYCSubmissionDto } from './dto/create-kyc-submission.dto';
import { VerifyFaceDto } from './dto/verify-face.dto';
import { DeleteDocumentDto } from './dto/delete-document.dto';
import { FetchDigiLockerDocumentsDto } from './dto/fetch-digilocker-documents.dto';
import { ProcessDigiLockerDocumentsDto } from './dto/process-digilocker-documents.dto';

/**
 * KYC Controller
 *
 * Handles all KYC-related HTTP endpoints including document uploads (PAN, Aadhaar front/back, live photo),
 * OCR data extraction, and face verification. Uses Fastify's multipart stream handling for file uploads.
 *
 * @remarks
 * - All file uploads buffer streams immediately to prevent Fastify stream closure issues
 * - Supports both single-file (PAN, live photo) and multi-file (Aadhaar front/back) uploads
 * - Auto-creates clientUsers and submissions if they don't exist (for MVP convenience)
 * - Fastify multipart streams must be consumed during the `req.parts()` iteration
 *
 * @see {@link KycService} for business logic implementation
 */
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  /**
   * Create KYC Submission
   *
   * Creates a new KYC submission for the given clientUser. Auto-creates the clientUser if they don't exist.
   * This endpoint is typically called by the frontend before document uploads.
   *
   * @param dto - Contains userId (UUID v4)
   * @returns Created submission object with id and status
   * @throws BadRequestException if userId is invalid
   *
   * @example
   * POST /api/kyc/submission
   * Body: { userId: "550e8400-e29b-41d4-a716-446655440000" }
   * Response: { id: "abc123", userId: "...", status: "PENDING", createdAt: "..." }
   */
  @Post('submission')
  async createSubmission(@Body() dto: CreateKYCSubmissionDto) {
    return this.kycService.createSubmission(dto.userId);
  }

  /**
   * Get KYC Status
   *
   * Retrieves the current KYC verification status for a clientUser, including progress percentage
   * and status label. Used by the frontend to display status indicators.
   *
   * @param userId - UUID of the clientUser
   * @returns Object containing submission details, progress (0-100), and status label
   * @throws NotFoundException if clientUser has no KYC submission
   *
   * @example
   * GET /api/kyc/status/550e8400-e29b-41d4-a716-446655440000
   * Response: { submission: {...}, progress: 66, statusLabel: "OCR_COMPLETED" }
   */
  @Get('status/:userId')
  async getStatus(@Param('userId') userId: string) {
    return this.kycService.getKycStatusByUserId(userId);
  }

  /**
   * Get KYC Submission
   *
   * Retrieves the full KYC submission details for a clientUser, including all document URLs,
   * extracted data, and verification scores.
   *
   * @param userId - UUID of the clientUser
   * @returns Full KYC submission object
   * @throws HttpException with 404 status if submission not found
   *
   * @example
   * GET /api/kyc/submission/550e8400-e29b-41d4-a716-446655440000
   * Response: { id: "...", panDocumentUrl: "...", aadhaarFrontUrl: "...", ... }
   */
  @Get('submission/:userId')
  async getSubmission(@Param('userId') userId: string) {
    const submission = await this.kycService.getSubmissionByUserId(userId);
    if (!submission) {
      throw new HttpException('Submission not found', HttpStatus.NOT_FOUND);
    }
    return submission;
  }

  /**
   * Upload Aadhaar Card Document (Front and/or Back)
   *
   * Accepts one or both sides of Aadhaar card (front contains photo, back contains address).
   * Supports uploading both simultaneously or separately. Creates submission if doesn't exist.
   *
   * **Aadhaar Card Structure**:
   * - Front: Contains photo, name, DOB, Aadhaar number (used for face matching)
   * - Back: Contains address details
   *
   * @param req - Fastify request with multipart form data containing:
   *   - 'userId' field: UUID v4 string
   *   - 'front' attachment (optional): Front side image (JPEG/PNG, max 5MB)
   *   - 'back' attachment (optional): Back side image (JPEG/PNG, max 5MB)
   * @returns Object with success flag, submissionId, and separate front/back URLs
   * @throws BadRequestException if userId missing or both files missing
   * @throws HttpException if upload fails
   *
   * @example
   * POST /api/kyc/upload/aadhaar
   * Content-Type: multipart/form-data
   * Body: { userId: "550e...", front: <binary>, back: <binary> }
   * Response: {
   *   success: true,
   *   submissionId: "abc123",
   *   front: { submissionId: "abc123", documentUrl: "kyc-aadhaar/clientUser-id/AADHAAR_CARD_FRONT_123.jpg" },
   *   back: { submissionId: "abc123", documentUrl: "kyc-aadhaar/clientUser-id/AADHAAR_CARD_BACK_456.jpg" }
   * }
   */
  /**
   * Upload and Decode Aadhaar QR Code
   *
   * Accepts the raw QR string scanned from an Aadhaar card.
   * Decodes Secure QR and legacy XML formats securely on the backend.
   * Extracts demographics and JPEG2000 photograph.
   *
   * @param body - { userId: string, rawQrText: string }
   */
  @Post('upload/aadhaar-qr')
  async uploadAadhaarQr(@Body() body: { userId: string; rawQrText: string }) {
    if (!body.userId || !body.rawQrText) {
      throw new BadRequestException('userId and rawQrText are required');
    }

    try {
      const result = await this.kycService.uploadAadhaarQr(body.userId, body.rawQrText);
      return {
        success: true,
        submissionId: result.id,
        aadhaarNumber: result.aadhaarNumber,
        photoIncluded: !!result.aadhaarFrontUrl,
        message: 'Aadhaar QR successfully decoded and saved.',
      };
    } catch (e: any) {
      Logger.error(`Aadhaar QR upload failed: ${e.message}`, e.stack, 'KycController');
      throw new HttpException(e.message || 'Failed to process QR', HttpStatus.BAD_REQUEST);
    }
  }

  @Post('upload/aadhaar')
  async uploadAadhaar(@Req() req: FastifyRequest) {
    try {
      const parts = req.parts();
      let userId: string | undefined;
      let frontFileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;
      let backFileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;

      // Parse multipart form data for multiple files
      for await (const part of parts) {
        if (part.type === 'field' && part.fieldname === 'userId') {
          userId = part.value as string;
        } else if (part.type === 'file') {
          // Buffer immediately while stream is open
          const buffer = await part.toBuffer();
          const fileData = {
            buffer,
            filename: part.filename,
            mimetype: part.mimetype,
          };

          if (part.fieldname === 'front') {
            frontFileData = fileData;
          } else if (part.fieldname === 'back') {
            backFileData = fileData;
          }
        }
      }

      if (!userId) {
        throw new BadRequestException('userId is required');
      }

      if (!frontFileData && !backFileData) {
        throw new BadRequestException('At least one file (front or back) is required');
      }

      const results: any = {};

      if (frontFileData) {
        // Create MultipartFile-like object with buffered data
        const frontFile: MultipartFile = {
          ...frontFileData,
          toBuffer: async () => frontFileData.buffer,
        } as any;
        const submission = await this.kycService.uploadAadhaarFront(userId, frontFile);
        results.front = {
          submissionId: submission.id,
          documentUrl: submission.aadhaarFrontUrl,
        };
      }

      if (backFileData) {
        // Create MultipartFile-like object with buffered data
        const backFile: MultipartFile = {
          ...backFileData,
          toBuffer: async () => backFileData.buffer,
        } as any;
        const submission = await this.kycService.uploadAadhaarBack(userId, backFile);
        results.back = {
          submissionId: submission.id,
          documentUrl: submission.aadhaarBackUrl,
        };
      }

      return {
        success: true,
        submissionId: results.front?.submissionId || results.back?.submissionId,
        ...results,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('delete/aadhaar/front')
  async deleteAadhaarFront(@Body() dto: DeleteDocumentDto) {
    const submission = await this.kycService.deleteAadhaarFront(dto.userId, dto.submissionId);
    return { success: true, submissionId: submission.id };
  }

  @Post('delete/aadhaar/back')
  async deleteAadhaarBack(@Body() dto: DeleteDocumentDto) {
    const submission = await this.kycService.deleteAadhaarBack(dto.userId, dto.submissionId);
    return { success: true, submissionId: submission.id };
  }

  /**
   * Upload Live Photo (Selfie)
   *
   * Accepts a live photo captured from webcam for face verification. Photo must contain
   * the clientUser's face and is used to compare against the photo on PAN/Aadhaar documents.
   *
   * **Prerequisites**: PAN or Aadhaar document must be uploaded first (face verification
   * requires a reference photo from identity documents).
   *
   * @param req - Fastify request with multipart form data containing:
   *   - 'userId' field: UUID v4 string
   *   - 'file' attachment: Live photo image (JPEG/PNG, max 5MB, min 300x300 pixels)
   * @returns Object with success flag, submissionId, and MinIO document URL
   * @throws BadRequestException if userId/file missing, or no Aadhaar/PAN uploaded yet
   * @throws HttpException if upload fails
   *
   * @example
   * POST /api/kyc/upload/live-photo
   * Content-Type: multipart/form-data
   * Body: { userId: "550e...", file: <binary> }
   * Response: { success: true, submissionId: "abc123", documentUrl: "kyc-live-photos/clientUser-id/LIVE_PHOTO_123.jpg" }
   */
  @Post('upload/live-photo')
  async uploadLivePhoto(@Req() req: FastifyRequest) {
    try {
      const parts = req.parts();
      let userId: string | undefined;
      let fileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'userId') {
            userId = part.value as string;
          }
        } else if (part.type === 'file' && part.fieldname === 'file') {
          // Buffer immediately while stream is open
          const buffer = await part.toBuffer();
          fileData = {
            buffer,
            filename: part.filename,
            mimetype: part.mimetype,
          };
        }
      }

      if (!userId) {
        throw new BadRequestException('userId is required');
      }

      if (!fileData) {
        throw new BadRequestException('File is required');
      }

      // Create MultipartFile-like object with buffered data
      const file: MultipartFile = {
        ...fileData,
        toBuffer: async () => fileData.buffer,
      } as any;

      const submission = await this.kycService.uploadLivePhotoDocument(userId, file);
      return {
        success: true,
        submissionId: submission.id,
        documentUrl: submission.livePhotoUrl,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Upload Digital Signature
   *
   * Accepts a drawn or uploaded signature image (PNG/JPEG). Stored in MinIO for downstream
   * validation and record-keeping. No status transition is enforced here; signatures are
   * optional in the current workflow but persisted for auditability.
   */
  @Post('upload/signature')
  async uploadSignature(@Req() req: FastifyRequest) {
    try {
      const parts = req.parts();
      let userId: string | undefined;
      let fileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;

      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'userId') {
            userId = part.value as string;
          }
        } else if (part.type === 'file' && part.fieldname === 'file') {
          const buffer = await part.toBuffer();
          fileData = {
            buffer,
            filename: part.filename,
            mimetype: part.mimetype,
          };
        }
      }

      if (!userId) {
        throw new BadRequestException('userId is required');
      }

      if (!fileData) {
        throw new BadRequestException('File is required');
      }

      const file: MultipartFile = {
        ...fileData,
        toBuffer: async () => fileData.buffer,
      } as any;

      const submission = await this.kycService.uploadSignatureDocument(userId, file);
      return {
        success: true,
        submissionId: submission.id,
        documentUrl: submission.signatureUrl,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Trigger Face Verification
   *
   * Initiates face verification workflow: downloads documents from MinIO, extracts faces
   * using face-api.js, calculates similarity score (Euclidean distance), and performs
   * basic liveness detection. Updates submission with scores and status.
   *
   * **Verification Logic**:
   * 1. Face Extraction: Extracts largest face from live photo and PAN/Aadhaar (fallback order)
   * 2. Face Matching: Computes descriptor distance (threshold: 0.6 = 60% similarity)
   * 3. Liveness Detection: Basic landmark analysis (MVP - will be enhanced)
   * 4. Combined Score: Both face match and liveness must be ≥80% to auto-approve
   * 5. Status Update: FACE_VERIFIED if passed, PENDING_REVIEW if failed
   *
   * @param dto - Contains submissionId (UUID)
   * @returns Object with success flag, submissionId, and verification results (scores, status)
   * @throws NotFoundException if submission not found or documents missing
   * @throws BadRequestException if face not detected in images
   * @throws HttpException if verification process fails
   *
   * @example
   * POST /api/kyc/verify/face
   * Body: { submissionId: "abc123" }
   * Response: {
   *   success: true,
   *   submissionId: "abc123",
   *   verificationResults: { faceMatchScore: 0.87, livenessScore: 0.92, internalStatus: "FACE_VERIFIED" }
   * }
   */
  @Post('verify/face')
  async verifyFace(@Body() dto: VerifyFaceDto) {
    try {
      const submission = await this.kycService.verifyFaceAndUpdate(dto.submissionId);
      return {
        success: true,
        submissionId: submission.id,
        verificationResults: {
          faceMatchScore: submission.faceMatchScore,
          livenessScore: submission.livenessScore,
          internalStatus: submission.internalStatus,
        },
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(
        err?.message ?? 'Face verification failed',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }



  /**
   * Fetch Documents from DigiLocker
   *
   * Initiates document fetch from DigiLocker for the specified clientUser and document types.
   * Documents are automatically stored in MinIO and the submission is updated.
   *
   * @param dto - Request body with userId and documentTypes
   * @returns Success response with submission details and fetched document URLs
   * @throws BadRequestException if clientUser not authorized with DigiLocker
   * @throws NotFoundException if requested documents not available
   *
   * @example
   * POST /api/kyc/digilocker/fetch
   * Body: { userId: "550e8400-e29b-41d4-a716-446655440000", documentTypes: ["PAN", "AADHAAR"] }
   *
   * Response:
   * {
   *   success: true,
   *   submissionId: "sub_123abc-456def-789ghi",
   *   documentsFetched: ["PAN", "AADHAAR"],
   *   documentUrls: {
   *     panDocumentUrl: "minio://kyc/pan-123.jpg",
   *     aadhaarFrontUrl: "minio://kyc/aadhaar-456.jpg"
   *   }
   * }
   */
  @Post('digilocker/fetch')
  async fetchDigiLockerDocuments(@Body() dto: FetchDigiLockerDocumentsDto) {
    try {
      const result = await this.kycService.fetchDocumentsFromDigiLocker(dto.userId, dto.documentTypes);
      return {
        success: true,
        submissionId: result.submission.id,
        documentsFetched: result.fetchedDocuments,
        documentUrls: {
          panDocumentUrl: result.submission.panDocumentUrl,
          aadhaarFrontUrl: result.submission.aadhaarFrontUrl,
        },
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'DigiLocker fetch failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get DigiLocker Fetch Status
   *
   * Checks DigiLocker authorization status and available documents for a clientUser.
   *
   * @param userId - ClientUser UUID from path parameter
   * @returns Status object with authorization and document availability
   *
   * @example
   * GET /api/kyc/digilocker/status/550e8400-e29b-41d4-a716-446655440000
   *
   * Response:
   * {
   *   authorized: true,
   *   documentsFetched: false,
   *   documentSource: "MANUAL_UPLOAD",
   *   availableDocuments: ["PAN", "AADHAAR"],
   *   submission: { ... }
   * }
   */
  @Get('digilocker/status/:userId')
  async getDigiLockerStatus(@Param('userId') userId: string) {
    try {
      return await this.kycService.getDigiLockerFetchStatus(userId);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Failed to get DigiLocker status', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Process DigiLocker Documents
   *
   * Triggers OCR extraction and face verification for DigiLocker-fetched documents.
   *
   * @param dto - Request body with submissionId
   * @returns Success response with OCR results and verification scores
   * @throws BadRequestException if submission has no documents to process
   *
   * @example
   * POST /api/kyc/digilocker/process
   * Body: { submissionId: "sub_123abc-456def-789ghi" }
   *
   * Response:
   * {
   *   success: true,
   *   submissionId: "sub_123abc-456def-789ghi",
   *   ocrCompleted: true,
   *   faceVerified: true,
   *   extractedData: {
   *     panNumber: "ABCDE1234F",
   *     aadhaarNumber: "XXXX XXXX 1234",
   *     fullName: "John Doe"
   *   },
   *   verificationScores: {
   *     faceMatchScore: 0.87,
   *     livenessScore: 0.92
   *   }
   * }
   */
  @Post('digilocker/process')
  async processDigiLockerDocuments(@Body() dto: ProcessDigiLockerDocumentsDto) {
    try {
      const submission = await this.kycService.processDigiLockerDocuments(dto.submissionId);
      return {
        success: true,
        submissionId: submission.id,
        ocrCompleted: false,
        faceVerified: Boolean(submission.faceMatchScore),
        extractedData: {
          panNumber: submission.panNumber,
          aadhaarNumber: submission.aadhaarNumber,
          fullName: submission.fullName,
        },
        verificationScores: {
          faceMatchScore: submission.faceMatchScore,
          livenessScore: submission.livenessScore,
        },
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'DigiLocker processing failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
