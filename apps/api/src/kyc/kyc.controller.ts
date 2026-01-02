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
} from '@nestjs/common';
import type { FastifyRequest } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import { KycService } from './kyc.service';
import { CreateKYCSubmissionDto } from './dto/create-kyc-submission.dto';
import { ExtractAadhaarDto, ExtractPanDto } from '../ocr/dto/extract-document.dto';
import { VerifyFaceDto } from './dto/verify-face.dto';
import { DeleteDocumentDto } from './dto/delete-document.dto';

/**
 * KYC Controller
 * 
 * Handles all KYC-related HTTP endpoints including document uploads (PAN, Aadhaar front/back, live photo),
 * OCR data extraction, and face verification. Uses Fastify's multipart stream handling for file uploads.
 * 
 * @remarks
 * - All file uploads buffer streams immediately to prevent Fastify stream closure issues
 * - Supports both single-file (PAN, live photo) and multi-file (Aadhaar front/back) uploads
 * - Auto-creates users and submissions if they don't exist (for MVP convenience)
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
   * Creates a new KYC submission for the given user. Auto-creates the user if they don't exist.
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
   * Retrieves the current KYC verification status for a user, including progress percentage
   * and status label. Used by the frontend to display status indicators.
   * 
   * @param userId - UUID of the user
   * @returns Object containing submission details, progress (0-100), and status label
   * @throws NotFoundException if user has no KYC submission
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
   * Retrieves the full KYC submission details for a user, including all document URLs,
   * extracted data, and verification scores.
   * 
   * @param userId - UUID of the user
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
   * Upload PAN Card Document
   * 
   * Accepts a single image file (JPEG/PNG) and stores it in MinIO. Creates a new KYC submission
   * if one doesn't exist for the user. Updates submission status to DOCUMENTS_UPLOADED.
   * 
   * **Important**: Buffers the file stream immediately during multipart parsing to prevent
   * Fastify stream closure issues. Fastify closes streams after `req.parts()` iteration completes.
   * 
   * @param req - Fastify request with multipart form data containing:
   *   - 'userId' field: UUID v4 string
   *   - 'file' attachment: JPEG/PNG image (max 5MB, 300x300 to 8192x8192 pixels)
   * @returns Object with success flag, submissionId (UUID), and MinIO document URL
   * @throws BadRequestException if userId or file is missing, or file validation fails
   * @throws HttpException if upload fails or storage service errors
   * 
   * @example
   * POST /api/kyc/upload/pan
   * Content-Type: multipart/form-data
   * Body: { userId: "550e8400-...", file: <binary> }
   * Response: { success: true, submissionId: "abc123", documentUrl: "kyc-pan/user-id/PAN_CARD_1234567890.jpg" }
   */
  @Post('upload/pan')
  async uploadPan(@Req() req: FastifyRequest) {
    try {
      const parts = req.parts();
      let userId: string | undefined;
      let fileData: { buffer: Buffer; filename: string; mimetype: string } | undefined;

      // Parse multipart form data - must buffer file immediately while stream is open
      for await (const part of parts) {
        if (part.type === 'field') {
          if (part.fieldname === 'userId') {
            userId = part.value as string;
          }
        } else if (part.type === 'file' && part.fieldname === 'file') {
          // Buffer immediately while stream is open to prevent closure issues
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

      // Create MultipartFile-like object with buffered data for service layer
      const file: MultipartFile = {
        ...fileData,
        toBuffer: async () => fileData.buffer,
      } as any;

      const submission = await this.kycService.uploadPanDocument(userId, file);
      return {
        success: true,
        submissionId: submission.id,
        documentUrl: submission.panDocumentUrl,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Upload failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
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
   *   front: { submissionId: "abc123", documentUrl: "kyc-aadhaar/user-id/AADHAAR_CARD_FRONT_123.jpg" },
   *   back: { submissionId: "abc123", documentUrl: "kyc-aadhaar/user-id/AADHAAR_CARD_BACK_456.jpg" }
   * }
   */
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

  @Post('delete/pan')
  async deletePan(@Body() dto: DeleteDocumentDto) {
    const submission = await this.kycService.deletePanDocument(dto.userId, dto.submissionId);
    return { success: true, submissionId: submission.id };
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
   * the user's face and is used to compare against the photo on PAN/Aadhaar documents.
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
   * Response: { success: true, submissionId: "abc123", documentUrl: "kyc-live-photos/user-id/LIVE_PHOTO_123.jpg" }
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
   * Extract PAN Card Data (OCR)
   * 
   * Uses Tesseract.js to perform OCR on uploaded PAN card image. Extracts PAN number
   * (regex: [A-Z]{5}[0-9]{4}[A-Z]), name, and date of birth. Preprocesses image
   * (grayscale, normalize, sharpen) for better accuracy.
   * 
   * **Extraction Logic**:
   * - PAN Number: 10-character alphanumeric (e.g., ABCDE1234F)
   * - Name: Heuristic-based extraction with blacklist filtering
   * - DOB: Date pattern matching (DD/MM/YYYY, DD-MM-YYYY, etc.)
   * - Confidence Threshold: 60% minimum for OCR results
   * 
   * @param dto - Contains submissionId (UUID)
   * @returns Object with success flag, submissionId, and extracted data (panNumber, fullName, dateOfBirth)
   * @throws NotFoundException if submission not found or PAN document not uploaded
   * @throws HttpException if OCR fails
   * 
   * @example
   * POST /api/kyc/extract/pan
   * Body: { submissionId: "abc123" }
   * Response: { 
   *   success: true, 
   *   submissionId: "abc123",
   *   extractedData: { panNumber: "ABCDE1234F", fullName: "John Doe", dateOfBirth: "1990-01-15" }
   * }
   */
  @Post('extract/pan')
  async extractPan(@Body() dto: ExtractPanDto) {
    try {
      const submission = await this.kycService.extractPanDataAndUpdate(dto.submissionId);
      return {
        success: true,
        submissionId: submission.id,
        extractedData: {
          panNumber: submission.panNumber,
          fullName: submission.fullName,
          dateOfBirth: submission.dateOfBirth,
        },
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'PAN extraction failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Extract Aadhaar Card Data (OCR)
   * 
   * Uses Tesseract.js to perform OCR on uploaded Aadhaar card images (front/back or legacy single image).
   * Extracts Aadhaar number (12 digits), name, and address. **Important**: Aadhaar number is masked
   * to show only last 4 digits per UIDAI compliance (e.g., "XXXX XXXX 1234").
   * 
   * **Extraction Logic**:
   * - Aadhaar Number: 12 digits with optional spaces (regex: /\\b\\d{4}\\s?\\d{4}\\s?\\d{4}\\b/)
   * - Masking: Only last 4 digits stored (UIDAI guideline to protect privacy)
   * - Name: Extracted from front side
   * - Address: Extracted from back side (if available)
   * - Confidence Threshold: 60% minimum for OCR results
   * 
   * @param dto - Contains submissionId (UUID)
   * @returns Object with success flag, submissionId, and extracted data (aadhaarNumber masked, fullName, address)
   * @throws NotFoundException if submission not found or Aadhaar document not uploaded
   * @throws HttpException if OCR fails
   * 
   * @example
   * POST /api/kyc/extract/aadhaar
   * Body: { submissionId: "abc123" }
   * Response: { 
   *   success: true, 
   *   submissionId: "abc123",
   *   extractedData: { aadhaarNumber: "XXXX XXXX 1234", fullName: "John Doe", address: "123 Main St..." }
   * }
   */
  @Post('extract/aadhaar')
  async extractAadhaar(@Body() dto: ExtractAadhaarDto) {
    try {
      const submission = await this.kycService.extractAadhaarDataAndUpdate(dto.submissionId);
      return {
        success: true,
        submissionId: submission.id,
        extractedData: {
          aadhaarNumber: submission.aadhaarNumber,
          fullName: submission.fullName,
          address: submission.address,
        },
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Aadhaar extraction failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
