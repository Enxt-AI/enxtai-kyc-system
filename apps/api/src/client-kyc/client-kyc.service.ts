import { Injectable, NotFoundException, ForbiddenException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { KycService } from '../kyc/kyc.service';
import { DigiLockerAuthService } from '../digilocker/digilocker-auth.service';
import { InitiateKycDto } from './dto/initiate-kyc.dto';
import {
  InitiateKycResponseDto,
  KycStatusResponseDto,
  UploadResponseDto,
} from './dto/client-kyc-response.dto';
import { InternalStatus } from '@enxtai/shared-types';
import { DocumentSource } from '@prisma/client';
import type { MultipartFile } from '@fastify/multipart';
import * as jwt from 'jsonwebtoken';
import { computeStepProgress } from '../client/client.service';

/**
 * Client KYC Service
 *
 * Tenant-aware wrapper service that provides client-facing KYC APIs with external
 * clientUser ID mapping and tenant isolation. This service bridges the gap between
 * client-provided identifiers and internal UUIDs while enforcing multi-tenant security.
 *
 * **External ClientUser ID Mapping Strategy:**
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
  private readonly logger = new Logger(ClientKycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly kycService: KycService,
    private readonly digiLockerAuthService: DigiLockerAuthService,
  ) {}

  /**
   * Get or Create ClientUser by External ID
   *
   * Maps client-provided external clientUser ID to internal UUID. Creates clientUser if not found.
   * This method implements the external-to-internal ID mapping layer that allows clients
   * to reference their own clientUser identifiers without exposing internal database UUIDs.
   *
   * **Composite Key Lookup:**
   * - Queries: `WHERE clientId = ? AND externalUserId = ?`
   * - Unique constraint: `@@unique([clientId, externalUserId])`
   * - Prevents duplicate external IDs within same client
   *
   * **Auto-Creation Logic:**
   * - If clientUser not found, creates new record with provided email/phone
   * - Falls back to generated email/phone if not provided
   * - Generated email: `clientUser-{first8CharsOfUuid}@kyc-temp.local`
   * - Generated phone: `999{timestamp7Digits}` (avoids collisions)
   *
   * @param clientId - UUID of client organization (from TenantMiddleware)
   * @param externalUserId - Client's own clientUser identifier (e.g., "customer-123")
   * @param email - Optional clientUser email (or generated if omitted)
   * @param phone - Optional clientUser phone (or generated if omitted)
   * @returns Internal clientUser UUID for use with KycService
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
    // Lookup clientUser by composite key
    let clientUser = await this.prisma.clientUser.findUnique({
      where: {
        clientId_externalUserId: {
          clientId,
          externalUserId,
        },
      },
    });

    if (!clientUser) {
      // Auto-create clientUser with provided or generated email/phone
      const generatedEmail = `clientUser-${externalUserId.substring(0, 8)}@kyc-temp.local`;
      const generatedPhone = this.generateTempPhone();

      clientUser = await this.prisma.clientUser.create({
        data: {
          clientId,
          externalUserId,
          email: email || generatedEmail,
          phone: phone || generatedPhone,
        },
      });
    }

    return clientUser.id;
  }

  /**
   * Initiate KYC Session
   *
   * Creates a new KYC verification session for a client's end-clientUser. Returns session ID,
   * upload URLs, and a tokenized kycFlowUrl for redirecting the clientUser to the EnxtAI
   * KYC frontend.
   *
   * **Workflow:**
   * 1. Map externalUserId to internal UUID (create clientUser if new)
   * 2. Create KYCSubmission record with PENDING status
   * 3. Generate a short-lived JWT (25 min) containing session context
   * 4. Build kycFlowUrl pointing to the EnxtAI frontend /kyc/start page with the JWT
   * 5. Return session ID, upload endpoints, and kycFlowUrl
   *
   * **JWT Payload:**
   * The JWT embeds the following claims so the frontend can bootstrap the KYC session
   * without the client app exposing the raw API key in the redirect URL:
   * - clientId: UUID of the authenticated client organization
   * - userId: Internal clientUser UUID (mapped from externalUserId)
   * - externalUserId: The client's own clientUser identifier (echoed back in webhooks)
   * - kycSessionId: The KYC submission UUID
   * - apiKey: The raw API key from the request header (needed by frontend for API calls)
   * - returnUrl: Optional URL to redirect the clientUser back to after KYC completion/cancellation
   *
   * **Authentication:**
   * - Requires X-API-Key header (validated by TenantMiddleware)
   * - clientId extracted from API key and injected into request context
   *
   * @param clientId - UUID of client organization (from TenantMiddleware)
   * @param dto - Request payload with externalUserId, email, phone, metadata, returnUrl
   * @param apiKey - Raw plaintext API key from request header (from TenantMiddleware)
   * @returns Session ID, status, upload URLs, and kycFlowUrl
   */
  async initiateKyc(
    clientId: string,
    dto: InitiateKycDto,
    apiKey: string,
  ): Promise<InitiateKycResponseDto> {
    // Map external clientUser ID to internal UUID
    const userId = await this.getOrCreateUserByExternalId(
      clientId,
      dto.externalUserId,
      dto.email,
      dto.phone,
    );

    // ------------------------------------------------------------------
    // Re-initiation handling: reuse existing non-terminal submissions.
    //
    // When a clientUser clicks "Continue Verification" on the client app (e.g., SMC),
    // the client calls POST /v1/kyc/initiate again. Without this check, a new
    // orphan submission would be created every time, losing all prior upload
    // progress.
    //
    // Strategy:
    // - Look for the most recent submission for this (userId, clientId) pair
    //   that is NOT in a terminal state (VERIFIED or REJECTED).
    // - If found, reuse it -- the clientUser can resume from where they left off.
    // - If not found (first initiation or all prior submissions are terminal),
    //   create a new submission.
    //
    // Terminal states (VERIFIED, REJECTED) are excluded because a clientUser who was
    // previously verified/rejected may need to re-verify (e.g., document expired).
    // Non-terminal states that ARE reused: PENDING, DOCUMENTS_UPLOADED,
    // OCR_COMPLETED, FACE_VERIFIED, PENDING_REVIEW.
    // ------------------------------------------------------------------
    let submission = await this.prisma.kYCSubmission.findFirst({
      where: {
        userId,
        clientId,
        internalStatus: {
          notIn: [
            'VERIFIED' as any,
            'REJECTED' as any,
          ],
        },
      },
      orderBy: { submissionDate: 'desc' },
    });

    const isResuming = Boolean(submission);

    if (!submission) {
      // No existing non-terminal submission found -- create a new one.
      submission = await this.prisma.kYCSubmission.create({
        data: {
          userId,
          clientId,
          internalStatus: InternalStatus.PENDING,
          documentSource: DocumentSource.MANUAL_UPLOAD,
        },
      });
    }

    // ------------------------------------------------------------------
    // Generate a short-lived JWT for the KYC redirect flow.
    //
    // This token is embedded in the kycFlowUrl that the client app redirects
    // the clientUser's browser to. The EnxtAI frontend /kyc/start page validates
    // this token server-side (via /api/kyc/validate-token) and uses the
    // decoded payload to bootstrap sessionStorage (API key, clientUser ID, etc.)
    // without ever exposing the raw API key in the URL.
    //
    // Token expiry: 25 minutes (enough time for the clientUser to complete the
    // KYC flow, but short enough to limit abuse if the URL is leaked).
    // ------------------------------------------------------------------
    const jwtSecret = process.env.JWT_KYC_SESSION_SECRET;
    if (!jwtSecret) {
      this.logger.error('JWT_KYC_SESSION_SECRET is not configured. Cannot generate kycFlowUrl.');
      throw new BadRequestException(
        'KYC session token generation is not configured. Contact system administrator.',
      );
    }

    // Compute step-level progress before building the JWT so the token
    // carries the current completion state. This lets the /kyc/start page
    // route the clientUser directly to their next incomplete step on resume.
    const stepProgress = computeStepProgress(submission);

    const tokenPayload = {
      clientId,
      userId,
      externalUserId: dto.externalUserId,
      kycSessionId: submission.id,
      apiKey,
      returnUrl: dto.returnUrl || null,
      // Embed step progress in the token so the frontend can determine
      // the correct entry point without an extra API call.
      completedSteps: stepProgress.completedSteps,
      currentStep: stepProgress.currentStep,
    };

    const sessionToken = jwt.sign(tokenPayload, jwtSecret, {
      expiresIn: '25m',
    });

    // Build the kycFlowUrl using the frontend URL from environment config.
    // Falls back to http://localhost:3000 for local development.
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/+$/, '');
    const kycFlowUrl = `${frontendUrl}/kyc/start?token=${sessionToken}`;

    this.logger.log(
      `KYC session ${isResuming ? 'resumed' : 'initiated'} for client ${clientId}, ` +
      `externalUserId=${dto.externalUserId}, kycSessionId=${submission.id}`,
    );

    return {
      kycSessionId: submission.id,
      status: submission.internalStatus as InternalStatus,
      uploadUrls: {
        pan: '/v1/kyc/upload/pan',
        aadhaarFront: '/v1/kyc/upload/aadhaar/front',
        aadhaarBack: '/v1/kyc/upload/aadhaar/back',
        livePhoto: '/v1/kyc/upload/live-photo',
      },
      kycFlowUrl,
      // Step-level progress for KYC state management / resumption.
      completedSteps: stepProgress.completedSteps,
      currentStep: stepProgress.currentStep,
      totalSteps: stepProgress.totalSteps,
      uiStep: submission.uiStep,
    };
  }

  /**
   * Upload PAN Document
   *
   * Uploads PAN card image for a client's end-clientUser. Delegates to KycService for actual
   * upload and validation logic.
   *
   * **Tenant Isolation:**
   * - Validates clientUser belongs to clientId (composite key lookup)
   * - Documents stored in client-specific bucket: `kyc-{clientId}-pan`
   *
   * **File Validation:**
   * - MIME types: image/jpeg, image/png
   * - Max size: 5MB
   * - Min dimensions: 300x300px
   * - Max dimensions: 8192x8192px
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's clientUser identifier
   * @param file - Multipart file upload
   * @returns Upload success response with session ID and document URL
   * @throws NotFoundException if clientUser not found
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
   * - Front side must include clientUser's photograph
   * - Used for face verification against live photo
   * - Stored in: `kyc-{clientId}-aadhaar-cards` bucket
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's clientUser identifier
   * @param file - Multipart file upload
   * @returns Upload success response
   * @throws NotFoundException if clientUser not found
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
   * @param externalUserId - Client's clientUser identifier
   * @param file - Multipart file upload
   * @returns Upload success response
   * @throws NotFoundException if clientUser not found
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
   * Uploads clientUser's live photograph for face verification against ID documents.
   *
   * **Verification Logic:**
   * - Live photo compared against Aadhaar front (contains photo)
   * - face-api.js computes similarity score (0.0 to 1.0)
   * - Threshold: 0.6 for auto-approval, <0.6 triggers manual review
   * - Stored in: `kyc-{clientId}-live-photos` bucket
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's clientUser identifier
   * @param file - Multipart file upload
   * @returns Upload success response
   * @throws NotFoundException if clientUser not found
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
   * Uploads clientUser's signature image for verification.
   *
   * **Document Requirements:**
   * - Clear signature on white background preferred
   * - Stored in: `kyc-{clientId}-signatures` bucket
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's clientUser identifier
   * @param file - Multipart file upload
   * @returns Upload success response
   * @throws NotFoundException if clientUser not found
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
      include: { clientUser: true },
    });

    if (!submission) {
      throw new NotFoundException('KYC session not found');
    }

    // Tenant isolation check
    if (submission.clientId !== clientId) {
      throw new ForbiddenException('Access denied to this KYC session');
    }

    // Calculate overall progress percentage (0-100 numeric value).
    const progress = this.calculateProgress(submission);

    // Compute step-level progress so the calling application (e.g., SMC)
    // can determine which KYC steps the clientUser has completed and which step
    // they should resume from. This uses the same helper that initiateKyc()
    // and getSubmissionDetail() use, ensuring consistent step derivation.
    const stepProgress = computeStepProgress(submission);

    // Map internal fields to client-friendly response
    return {
      kycSessionId: submission.id,
      externalUserId: submission.clientUser.externalUserId,
      status: submission.internalStatus as InternalStatus,
      progress,
      extractedData: this.buildExtractedData(submission),
      verificationScores: this.buildVerificationScores(submission),
      createdAt: submission.createdAt.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
      // Step-level progress for KYC state management / resumption.
      // These fields let the client app show granular progress (e.g.,
      // "2 of 4 steps completed") and route clientUsers to the correct step.
      completedSteps: stepProgress.completedSteps,
      currentStep: stepProgress.currentStep,
      totalSteps: stepProgress.totalSteps,
      uiStep: submission.uiStep,
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
   * Update internal UI Step
   *
   * @param clientId
   * @param kycSessionId
   * @param step
   */
  async updateUiStep(
    clientId: string,
    kycSessionId: string,
    step: number,
  ): Promise<{ success: boolean }> {
    const submission = await this.prisma.kYCSubmission.findUnique({
      where: { id: kycSessionId },
    });

    if (!submission) {
      throw new NotFoundException('KYC session not found');
    }

    if (submission.clientId !== clientId) {
      throw new ForbiddenException('Access denied to this KYC session');
    }

    await this.prisma.kYCSubmission.update({
      where: { id: kycSessionId },
      data: { uiStep: step },
    });

    return { success: true };
  }

  /**
   * Lookup ClientUser by External ID (Helper)
   *
   * Queries clientUser by composite key (clientId, externalUserId). Throws NotFoundException
   * if clientUser not found (unlike getOrCreateUserByExternalId which auto-creates).
   *
   * @param clientId - UUID of client organization
   * @param externalUserId - Client's clientUser identifier
   * @returns Internal clientUser UUID
   * @throws NotFoundException if clientUser not found
   * @private
   */
  private async lookupUserByExternalId(
    clientId: string,
    externalUserId: string,
  ): Promise<string> {
    const clientUser = await this.prisma.clientUser.findUnique({
      where: {
        clientId_externalUserId: {
          clientId,
          externalUserId,
        },
      },
    });

    if (!clientUser) {
      throw new NotFoundException(
        `ClientUser not found: externalUserId=${externalUserId}. Call POST /v1/kyc/initiate first.`,
      );
    }

    return clientUser.id;
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
   * Tenant-isolated: only deletes if clientUser belongs to specified client.
   *
   * @param clientId - Authenticated client ID
   * @param externalUserId - Client's clientUser identifier
   * @returns Success response
   * @throws NotFoundException if clientUser not found
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
   * Tenant-isolated: only deletes if clientUser belongs to specified client.
   *
   * @param clientId - Authenticated client ID
   * @param externalUserId - Client's clientUser identifier
   * @returns Success response
   * @throws NotFoundException if clientUser not found
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
   * Tenant-isolated: only deletes if clientUser belongs to specified client.
   *
   * @param clientId - Authenticated client ID
   * @param externalUserId - Client's clientUser identifier
   * @returns Success response
   * @throws NotFoundException if clientUser not found
   */
  async deleteAadhaarBack(
    clientId: string,
    externalUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const userId = await this.lookupUserByExternalId(clientId, externalUserId);
    await this.kycService.deleteAadhaarBack(userId);
    return { success: true, message: 'Aadhaar back document deleted successfully' };
  }

  /**
   * Initiate DigiLocker Authorization
   *
   * Generates DigiLocker OAuth 2.0 authorization URL for end-clientUser to authorize document access.
   * Validates submission ownership and maps external clientUser ID to internal UUID.
   *
   * @param clientId - Client tenant identifier
   * @param submissionId - KYC session identifier
   * @returns Promise with authorization URL and instructions
   *
   * @throws NotFoundException if submission not found
   * @throws ForbiddenException if submission belongs to different client
   */
  async initiateDigiLockerAuth(
    clientId: string,
    submissionId: string,
  ): Promise<{
    authorizationUrl: string;
    instructions: string;
    expiresIn: number;
  }> {
    // Validate submission exists and belongs to client
    const submission = await this.prisma.kYCSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.clientId !== clientId) {
      throw new ForbiddenException('Submission belongs to different client');
    }

    // Extract userId from submission
    const userId = submission.userId;

    // Generate authorization URL
    const authorizationUrl = await this.digiLockerAuthService.generateAuthorizationUrl(userId, submissionId);

    return {
      authorizationUrl,
      instructions: 'Redirect clientUser to this URL to authorize DigiLocker access. The authorization URL expires in 10 minutes.',
      expiresIn: 600, // 10 minutes
    };
  }

  /**
   * Fetch Documents from DigiLocker
   *
   * Downloads specified documents from clientUser's DigiLocker account and triggers automatic OCR processing.
   * Validates submission ownership and maps external clientUser ID to internal UUID.
   *
   * @param clientId - Client tenant identifier
   * @param submissionId - KYC session identifier
   * @param documentTypes - Array of document types to fetch ('PAN', 'AADHAAR')
   * @returns Promise with fetch results and document URLs
   *
   * @throws NotFoundException if submission not found
   * @throws ForbiddenException if submission belongs to different client
   * @throws BadRequestException if clientUser not authorized with DigiLocker
   */
  async fetchDigiLockerDocuments(
    clientId: string,
    submissionId: string,
    documentTypes: string[],
  ): Promise<{
    success: boolean;
    kycSessionId: string;
    documentsFetched: string[];
    documentUrls: {
      panDocumentUrl?: string;
      aadhaarFrontUrl?: string;
    };
    processingStatus: string;
  }> {
    // Validate submission exists and belongs to client
    const submission = await this.prisma.kYCSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.clientId !== clientId) {
      throw new ForbiddenException('Submission belongs to different client');
    }

    // Extract userId from submission
    const userId = submission.userId;

    // Fetch documents from DigiLocker
    const result = await this.kycService.fetchDocumentsFromDigiLocker(userId, documentTypes, submissionId);

    // Automatically trigger document processing
    await this.kycService.processDigiLockerDocuments(submissionId);

    // Get updated submission for document URLs
    const updatedSubmission = await this.prisma.kYCSubmission.findUnique({
      where: { id: submissionId },
    });

    return {
      success: true,
      kycSessionId: submissionId,
      documentsFetched: result.fetchedDocuments,
      documentUrls: {
        panDocumentUrl: updatedSubmission?.panDocumentUrl || undefined,
        aadhaarFrontUrl: updatedSubmission?.aadhaarFrontUrl || undefined,
      },
      processingStatus: 'OCR and face verification processing initiated',
    };
  }

  /**
   * Get DigiLocker Status
   *
   * Retrieves DigiLocker authorization status and available documents for a KYC session.
   * Validates submission ownership and maps external clientUser ID to internal UUID.
   *
   * @param clientId - Client tenant identifier
   * @param submissionId - KYC session identifier
   * @returns Promise with DigiLocker status and submission details
   *
   * @throws NotFoundException if submission not found
   * @throws ForbiddenException if submission belongs to different client
   */
  async getDigiLockerStatus(
    clientId: string,
    submissionId: string,
  ): Promise<{
    authorized: boolean;
    documentsFetched: boolean;
    documentSource: 'MANUAL_UPLOAD' | 'DIGILOCKER';
    availableDocuments: string[];
    submission: KycStatusResponseDto;
  }> {
    // Validate submission exists and belongs to client
    const submission = await this.prisma.kYCSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    if (submission.clientId !== clientId) {
      throw new ForbiddenException('Submission belongs to different client');
    }

    // Extract userId from submission
    const userId = submission.userId;

    // Get DigiLocker status
    const status = await this.kycService.getDigiLockerFetchStatus(userId);

    // Map to client-friendly response
    const kycStatus = await this.getKycStatus(clientId, submissionId);

    return {
      authorized: status.authorized,
      documentsFetched: status.documentsFetched,
      documentSource: status.documentSource,
      availableDocuments: status.availableDocuments,
      submission: kycStatus,
    };
  }
}
