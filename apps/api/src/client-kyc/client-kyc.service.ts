import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KycService } from '../kyc/kyc.service';
import { InitiateKycDto } from './dto/initiate-kyc.dto';
import {
  InitiateKycResponseDto,
  KycStatusResponseDto,
  UploadResponseDto,
} from './dto/client-kyc-response.dto';
import { InternalStatus } from '@enxtai/shared-types';
import { DocumentSource } from '@prisma/client';
import type { MultipartFile } from '@fastify/multipart';

/**
 * Client KYC Service
 *
 * Tenant-aware wrapper service that provides client-facing KYC APIs with external
 * user ID mapping and tenant isolation. This service bridges the gap between
 * client-provided identifiers and internal UUIDs while enforcing multi-tenant security.
 *
 * **External User ID Mapping Strategy:**
 * - Clients send `externalUserId` (e.g., "customer-123" from their system)
 * - Service maps to internal UUID using `(clientId, externalUserId)` composite key
 * - Composite unique index prevents duplicate external IDs within a tenant
 * - Internal UUIDs never exposed to clients
 *
 * **Tenant Isolation:**
 * - All database queries filtered by `clientId` (injected by TenantMiddleware)
 * - Prevents cross-tenant data access at service layer
 * - Documents stored in client-specific MinIO buckets
 *
 * **Business Logic Delegation:**
 * - Wraps existing `KycService` methods (no duplication)
 * - Handles ID mapping and tenant validation
 * - Delegates actual KYC operations to `KycService`
 *
 * @see {@link KycService} for core verification logic
 * @see {@link TenantMiddleware} for clientId injection
 */
@Injectable()
export class ClientKycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly kycService: KycService,
  ) {}

  /**
   * Get or Create User by External ID
   *
   * Maps client-provided external user ID to internal UUID. Creates user if not found.
   * This method implements the external-to-internal ID mapping layer that allows clients
   * to reference their own user identifiers without exposing internal database UUIDs.
   *
   * **Composite Key Lookup:**
   * - Queries: `WHERE clientId = ? AND externalUserId = ?`
   * - Unique constraint: `@@unique([clientId, externalUserId])`
   * - Prevents duplicate external IDs within same client
   *
   * **Auto-Creation Logic:**
   * - If user not found, creates new record with provided email/phone
   * - Falls back to generated email/phone if not provided
   * - Generated email: `user-{first8CharsOfUuid}@kyc-temp.local`
   * - Generated phone: `999{timestamp7Digits}` (avoids collisions)
   *
   * @param clientId - UUID of client organization (from TenantMiddleware)
   * @param externalUserId - Client's own user identifier (e.g., "customer-123")
   * @param email - Optional user email (or generated if omitted)
   * @param phone - Optional user phone (or generated if omitted)
   * @returns Internal user UUID for use with KycService
   *
   * @example
   * const userId = await getOrCreateUserByExternalId(
   *   'abc-123-def',
   *   'customer-456',
   *   'john@example.com',
   *   '+919876543210'
   * );
   * // Returns: "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d" (internal UUID)
   */
  private async getOrCreateUserByExternalId(
    clientId: string,
    externalUserId: string,
    email?: string,
    phone?: string,
  ): Promise<string> {
    // Lookup user by composite key
    let user = await this.prisma.user.findUnique({
      where: {
        clientId_externalUserId: {
          clientId,
          externalUserId,
        },
      },
    });

    if (!user) {
      // Auto-create user with provided or generated email/phone
      const generatedEmail = `user-${externalUserId.substring(0, 8)}@kyc-temp.local`;
      const generatedPhone = this.generateTempPhone();

      user = await this.prisma.user.create({
        data: {
          clientId,
          externalUserId,
          email: email || generatedEmail,
          phone: phone || generatedPhone,
        },
      });
    }

    return user.id;
  }

  /**
   * Initiate KYC Session
   *
   * Creates a new KYC verification session for a client's end-user. Returns session ID
   * and upload URLs for document submission.
   *
   * **Workflow:**
   * 1. Map externalUserId to internal UUID (create user if new)
   * 2. Create KYCSubmission record with PENDING status
   * 3. Return session ID and upload endpoints
   *
   * **Authentication:**
   * - Requires X-API-Key header (validated by TenantMiddleware)
   * - clientId extracted from API key and injected into request context
   *
   * @param clientId - UUID of client organization (from TenantMiddleware)
   * @param dto - Request payload with externalUserId, email, phone, metadata
   * @returns Session ID, status, and upload URLs
   *
   * @example
   * const response = await initiateKyc('client-abc-123', {
   *   externalUserId: 'customer-456',
   *   email: 'john@example.com',
   *   phone: '+919876543210',
   *   metadata: { transactionId: 'txn-789' }
   * });
   * // Returns: {
   * //   kycSessionId: 'a1b2c3d4-...',
   * //   status: 'PENDING',
   * //   uploadUrls: { pan: '/v1/kyc/upload/pan', ... }
   * // }
   */
  async initiateKyc(
    clientId: string,
    dto: InitiateKycDto,
  ): Promise<InitiateKycResponseDto> {
    // Map external user ID to internal UUID
    const userId = await this.getOrCreateUserByExternalId(
      clientId,
      dto.externalUserId,
      dto.email,
      dto.phone,
    );

    // Create submission with tenant context
    const submission = await this.prisma.kYCSubmission.create({
      data: {
        userId,
        clientId,
        internalStatus: InternalStatus.PENDING,
        documentSource: DocumentSource.MANUAL_UPLOAD,
      },
    });

    return {
      kycSessionId: submission.id,
      status: submission.internalStatus as InternalStatus,
      uploadUrls: {
        pan: '/v1/kyc/upload/pan',
        aadhaarFront: '/v1/kyc/upload/aadhaar/front',
        aadhaarBack: '/v1/kyc/upload/aadhaar/back',
        livePhoto: '/v1/kyc/upload/live-photo',
      },
    };
  }

  /**
   * Upload PAN Document
   *
   * Uploads PAN card image for a client's end-user. Delegates to KycService for actual
   * upload and validation logic.
   *
   * **Tenant Isolation:**
   * - Validates user belongs to clientId (composite key lookup)
   * - Documents stored in client-specific bucket: `kyc-{clientId}-pan`
   *
   * **File Validation:**
   * - MIME types: image/jpeg, image/png
   * - Max size: 5MB
   * - Min dimensions: 300x300px
   * - Max dimensions: 8192x8192px
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's user identifier
   * @param file - Multipart file upload
   * @returns Upload success response with session ID and document URL
   * @throws NotFoundException if user not found
   *
   * @example
   * const response = await uploadPan('client-abc', 'customer-123', panFile);
   * // Returns: { success: true, kycSessionId: '...', documentUrl: 'kyc-abc-pan/...' }
   */
  async uploadPan(
    clientId: string,
    externalUserId: string,
    file: MultipartFile,
  ): Promise<UploadResponseDto> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    const submission = await this.kycService.uploadPanDocument(userId, file, clientId);

    return {
      success: true,
      kycSessionId: submission.id,
      documentUrl: submission.panDocumentUrl || '',
    };
  }

  /**
   * Upload Aadhaar Front Document
   *
   * Uploads Aadhaar card front side (contains photo for face matching).
   *
   * **Document Requirements:**
   * - Front side must include user's photograph
   * - Used for face verification against live photo
   * - Stored in: `kyc-{clientId}-aadhaar-cards` bucket
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's user identifier
   * @param file - Multipart file upload
   * @returns Upload success response
   * @throws NotFoundException if user not found
   */
  async uploadAadhaarFront(
    clientId: string,
    externalUserId: string,
    file: MultipartFile,
  ): Promise<UploadResponseDto> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    const submission = await this.kycService.uploadAadhaarFront(userId, file, clientId);

    return {
      success: true,
      kycSessionId: submission.id,
      documentUrl: submission.aadhaarFrontUrl || '',
    };
  }

  /**
   * Upload Aadhaar Back Document
   *
   * Uploads Aadhaar card back side (contains address details).
   *
   * **Document Requirements:**
   * - Back side contains address information
   * - Used for OCR extraction of address fields
   * - Stored in: `kyc-{clientId}-aadhaar-cards` bucket
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's user identifier
   * @param file - Multipart file upload
   * @returns Upload success response
   * @throws NotFoundException if user not found
   */
  async uploadAadhaarBack(
    clientId: string,
    externalUserId: string,
    file: MultipartFile,
  ): Promise<UploadResponseDto> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    const submission = await this.kycService.uploadAadhaarBack(userId, file, clientId);

    return {
      success: true,
      kycSessionId: submission.id,
      documentUrl: submission.aadhaarBackUrl || '',
    };
  }

  /**
   * Upload Live Photo Document
   *
   * Uploads user's live photograph for face verification against ID documents.
   *
   * **Verification Logic:**
   * - Live photo compared against Aadhaar front (contains photo)
   * - face-api.js computes similarity score (0.0 to 1.0)
   * - Threshold: 0.6 for auto-approval, <0.6 triggers manual review
   * - Stored in: `kyc-{clientId}-live-photos` bucket
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's user identifier
   * @param file - Multipart file upload
   * @returns Upload success response
   * @throws NotFoundException if user not found
   */
  async uploadLivePhoto(
    clientId: string,
    externalUserId: string,
    file: MultipartFile,
  ): Promise<UploadResponseDto> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    const submission = await this.kycService.uploadLivePhotoDocument(userId, file, clientId);

    return {
      success: true,
      kycSessionId: submission.id,
      documentUrl: submission.livePhotoUrl || '',
    };
  }

  /**
   * Upload Signature Document
   *
   * Uploads user's signature image for verification.
   *
   * **Document Requirements:**
   * - Clear signature on white background preferred
   * - Stored in: `kyc-{clientId}-signatures` bucket
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's user identifier
   * @param file - Multipart file upload
   * @returns Upload success response
   * @throws NotFoundException if user not found
   */
  async uploadSignature(
    clientId: string,
    externalUserId: string,
    file: MultipartFile,
  ): Promise<UploadResponseDto> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    const submission = await this.kycService.uploadSignatureDocument(userId, file, clientId);

    return {
      success: true,
      kycSessionId: submission.id,
      documentUrl: submission.signatureUrl || '',
    };
  }

  /**
   * Get KYC Status
   *
   * Retrieves detailed status information for a KYC session. Includes extracted data,
   * verification scores, and progress tracking.
   *
   * **Tenant Isolation:**
   * - Validates submission.clientId === clientId (prevents cross-tenant access)
   * - Returns 403 Forbidden if tenant mismatch detected
   *
   * **Response Mapping:**
   * - Internal fields → Client-friendly names
   * - submissionId → kycSessionId
   * - userId (UUID) → externalUserId (client's identifier)
   * - Raw OCR data → Structured extractedData object
   *
   * **Progress Calculation:**
   * - 0%: No documents uploaded
   * - 25%: PAN uploaded
   * - 50%: Aadhaar (front/back) uploaded
   * - 75%: Live photo uploaded
   * - 100%: Face verification complete
   *
   * @param clientId - UUID of client organization
   * @param kycSessionId - KYC session UUID
   * @returns Detailed status response with extracted data and scores
   * @throws NotFoundException if session not found
   * @throws ForbiddenException if tenant mismatch
   *
   * @example
   * const status = await getKycStatus('client-abc', 'session-123');
   * // Returns: {
   * //   kycSessionId: 'session-123',
   * //   externalUserId: 'customer-456',
   * //   status: 'FACE_VERIFIED',
   * //   progress: 100,
   * //   extractedData: { panNumber: 'ABCDE1234F', ... },
   * //   verificationScores: { faceMatchScore: 0.95, ... },
   * //   createdAt: '2026-01-05T10:30:00Z',
   * //   updatedAt: '2026-01-05T10:45:00Z'
   * // }
   */
  async getKycStatus(
    clientId: string,
    kycSessionId: string,
  ): Promise<KycStatusResponseDto> {
    const submission = await this.prisma.kYCSubmission.findUnique({
      where: { id: kycSessionId },
      include: { user: true },
    });

    if (!submission) {
      throw new NotFoundException('KYC session not found');
    }

    // Tenant isolation check
    if (submission.clientId !== clientId) {
      throw new ForbiddenException('Access denied to this KYC session');
    }

    // Calculate progress percentage
    const progress = this.calculateProgress(submission);

    // Map internal fields to client-friendly response
    return {
      kycSessionId: submission.id,
      externalUserId: submission.user.externalUserId,
      status: submission.internalStatus as InternalStatus,
      progress,
      extractedData: this.buildExtractedData(submission),
      verificationScores: this.buildVerificationScores(submission),
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
    };
  }

  /**
   * Trigger Face Verification
   *
   * Manually triggers face verification workflow. This is optional as verification
   * can be auto-triggered when all documents are uploaded.
   *
   * **Verification Workflow:**
   * 1. Downloads live photo and Aadhaar front from MinIO
   * 2. Detects faces using face-api.js SSD MobileNet
   * 3. Computes 128-dimension face descriptors
   * 4. Calculates Euclidean distance (similarity score)
   * 5. Updates submission with scores and status
   *
   * **Auto-Approval Logic:**
   * - faceMatchScore >= 0.6: Status → FACE_VERIFIED
   * - faceMatchScore < 0.6: Status → MANUAL_REVIEW
   *
   * @param clientId - UUID of client organization
   * @param kycSessionId - KYC session UUID
   * @returns Verification results with scores
   * @throws NotFoundException if session not found
   * @throws ForbiddenException if tenant mismatch
   */
  async triggerVerification(clientId: string, kycSessionId: string): Promise<any> {
    const submission = await this.prisma.kYCSubmission.findUnique({
      where: { id: kycSessionId },
    });

    if (!submission) {
      throw new NotFoundException('KYC session not found');
    }

    if (submission.clientId !== clientId) {
      throw new ForbiddenException('Access denied to this KYC session');
    }

    // Delegate to KycService for verification logic
    const updated = await this.kycService.verifyFaceAndUpdate(kycSessionId);

    // Map to documented response format
    return {
      success: true,
      status: updated.internalStatus,
      faceMatchScore: updated.faceMatchScore,
      livenessScore: updated.livenessScore,
    };
  }

  /**
   * Lookup User by External ID (Helper)
   *
   * Queries user by composite key (clientId, externalUserId). Throws NotFoundException
   * if user not found (unlike getOrCreateUserByExternalId which auto-creates).
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's user identifier
   * @returns Internal user UUID
   * @throws NotFoundException if user not found
   * @private
   */
  private async lookupUserByExternalId(
    clientId: string,
    externalUserId: string,
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: {
        clientId_externalUserId: {
          clientId,
          externalUserId,
        },
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User not found: externalUserId=${externalUserId}. Call POST /v1/kyc/initiate first.`,
      );
    }

    return user.id;
  }

  /**
   * Calculate Progress Percentage (Helper)
   *
   * Computes completion progress based on uploaded documents and verification status.
   *
   * **Progress Breakdown:**
   * - 25%: PAN uploaded
   * - 25%: Aadhaar front uploaded
   * - 25%: Aadhaar back uploaded (or legacy aadhaarDocumentUrl)
   * - 25%: Live photo uploaded
   *
   * @param submission - KYCSubmission object
   * @returns Progress percentage (0-100)
   * @private
   */
  private calculateProgress(submission: any): number {
    let progress = 0;
    if (submission.panDocumentUrl) progress += 25;
    if (submission.aadhaarFrontUrl || submission.aadhaarDocumentUrl) progress += 25;
    if (submission.aadhaarBackUrl || submission.aadhaarDocumentUrl) progress += 25;
    if (submission.livePhotoUrl) progress += 25;
    return progress;
  }

  /**
   * Build Extracted Data Object (Helper)
   *
   * Maps OCR extraction results to structured extractedData object for client response.
   *
   * @param submission - KYCSubmission object
   * @returns Structured extracted data or null if OCR not completed
   * @private
   */
  private buildExtractedData(submission: any): any {
    const hasOcrData =
      submission.panNumber || submission.aadhaarNumber || submission.fullName;

    if (!hasOcrData) {
      return null;
    }

    return {
      panNumber: submission.panNumber || undefined,
      aadhaarNumber: submission.aadhaarNumber || undefined,
      fullName: submission.fullName || undefined,
      dateOfBirth: submission.dateOfBirth || undefined,
      address: submission.address || undefined,
    };
  }

  /**
   * Build Verification Scores Object (Helper)
   *
   * Maps face verification results to structured verificationScores object.
   *
   * @param submission - KYCSubmission object
   * @returns Structured scores or null if verification not performed
   * @private
   */
  private buildVerificationScores(submission: any): any {
    const hasScores = submission.faceMatchScore !== null;

    if (!hasScores) {
      return null;
    }

    return {
      faceMatchScore: submission.faceMatchScore || undefined,
      livenessScore: submission.livenessScore || undefined,
    };
  }

  /**
   * Generate Temporary Phone (Helper)
   *
   * Generates unique temporary phone number to avoid UNIQUE(clientId, phone) collisions.
   * Uses timestamp + random digits to ensure uniqueness.
   *
   * @returns Phone number in format: 999{timestamp7Digits}{random3Digits}
   * @private
   */
  private generateTempPhone(): string {
    const ts = Date.now().toString();
    const rand = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    return `999${ts.slice(-7)}${rand}`;
  }

  /**
   * Delete PAN Document
   *
   * Deletes PAN card document from storage and clears URL in database.
   * Tenant-isolated: only deletes if user belongs to specified client.
   *
   * @param clientId - Authenticated client ID
   * @param externalUserId - Client's user identifier
   * @returns Success response
   * @throws NotFoundException if user not found
   */
  async deletePan(
    clientId: string,
    externalUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    await this.kycService.deletePanDocument(userId);
    return { success: true, message: 'PAN document deleted successfully' };
  }

  /**
   * Delete Aadhaar Front Document
   *
   * Deletes Aadhaar front document from storage and clears URL in database.
   * Tenant-isolated: only deletes if user belongs to specified client.
   *
   * @param clientId - Authenticated client ID
   * @param externalUserId - Client's user identifier
   * @returns Success response
   * @throws NotFoundException if user not found
   */
  async deleteAadhaarFront(
    clientId: string,
    externalUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    await this.kycService.deleteAadhaarFront(userId);
    return { success: true, message: 'Aadhaar front document deleted successfully' };
  }

  /**
   * Delete Aadhaar Back Document
   *
   * Deletes Aadhaar back document from storage and clears URL in database.
   * Tenant-isolated: only deletes if user belongs to specified client.
   *
   * @param clientId - Authenticated client ID
   * @param externalUserId - Client's user identifier
   * @returns Success response
   * @throws NotFoundException if user not found
   */
  async deleteAadhaarBack(
    clientId: string,
    externalUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    await this.kycService.deleteAadhaarBack(userId);
    return { success: true, message: 'Aadhaar back document deleted successfully' };
  }
}
