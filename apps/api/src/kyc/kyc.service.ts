import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { DocumentSource, InternalStatus } from '@enxtai/shared-types';
import { InternalStatus as PrismaInternalStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { MAX_FILE_SIZE } from '../storage/storage.constants';
import { DocumentType, UploadDocumentDto } from '../storage/storage.types';
import { OcrService } from '../ocr/ocr.service';
import { FaceRecognitionService } from '../face-recognition/face-recognition.service';
import { WebhookService } from '../webhooks/webhook.service';
import { WebhookEvent } from '../webhooks/webhook-events.enum';
import { DigiLockerDocumentService } from '../digilocker/digilocker-document.service';
import type { MultipartFile } from '@fastify/multipart';
import sharp from 'sharp';

/** Allowed MIME types for document uploads (JPEG/PNG only) */
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const IMAGE_ONLY_MIME_TYPES = ['image/jpeg', 'image/png'];

/** Minimum image dimensions - lowered from 800x600 to support phone photos */
const MIN_WIDTH = 300;
const MIN_HEIGHT = 300;

/** Maximum image dimensions - increased from 4096x4096 to support high-res scans */
const MAX_WIDTH = 8192;
const MAX_HEIGHT = 8192;

/**
 * KYC Service
 *
 * Core business logic service for KYC (Know Your Customer) verification workflow.
 * Orchestrates document uploads, OCR text extraction, face recognition, and status management.
 *
 * **Workflow**:
 * 1. Document Upload: PAN, Aadhaar (front/back), Live Photo → MinIO storage
 * 2. OCR Extraction: Tesseract.js extracts text from PAN/Aadhaar
 * 3. Face Verification: face-api.js matches live photo against ID documents
 * 4. Status Progression: PENDING → DOCUMENTS_UPLOADED → OCR_COMPLETED → FACE_VERIFIED
 * 5. Admin Review: If confidence <80%, manual approval required
 *
 * **Auto-Creation Strategy (MVP)**:
 * - Users and submissions are auto-created if they don't exist during uploads
 * - Simplifies frontend logic by eliminating pre-creation API calls
 * - Generated emails/phones are placeholders (e.g., user-xxx@kyc-temp.local)
 *
 * **Multi-Tenancy**:
 * - All operations scoped to clientId (extracted from X-API-Key by TenantMiddleware)
 * - Documents stored in client-specific MinIO buckets (kyc-{clientId}-{suffix})
 * - User lookups constrained by (clientId, externalUserId) composite unique key
 * - Legacy internal endpoints use clientId '00000000-0000-0000-0000-000000000000'
 *
 * **Webhook Integration**:
 * - WebhookService injected for real-time status change notifications
 * - Webhooks triggered after document uploads and verification completion
 * - Failures logged but don't block KYC workflow (isolated error handling)
 *
 * @see {@link StorageService} for MinIO S3 operations
 * @see {@link OcrService} for Tesseract.js OCR integration
 * @see {@link FaceRecognitionService} for face-api.js verification
 * @see {@link WebhookService} for webhook delivery
 */
@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
    private readonly faceRecognitionService: FaceRecognitionService,
    private readonly webhookService: WebhookService,
    private readonly digiLockerDocumentService: DigiLockerDocumentService,
  ) {}

  /** Generate a temporary phone that won't collide with UNIQUE(phone) */
  private generateTempPhone() {
    const ts = Date.now().toString();
    const rand = Math.floor(Math.random() * 1000)
      .toString()
      .padStart(3, '0');
    // Use last 7 digits of timestamp + 3 random digits → 10 digits after the 999 prefix
    return `999${ts.slice(-7)}${rand}`;
  }

  /**
   * Get or Create User (Helper)
   *
   * Auto-creates user if they don't exist in the database. This MVP convenience feature
   * allows the frontend to start document uploads without pre-creating user accounts.
   *
   * **Generated Fields**:
   * - Email: user-{first8CharsOfUuid}@kyc-temp.local
   * - Phone: 999{timestamp7Digits} (ensures uniqueness)
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant isolation
   * - Maintains backward compatibility while supporting new client-facing endpoints
   *
   * @param userId - UUID v4 string
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns User object (existing or newly created)
   * @private
   */
  private async getOrCreateUser(userId: string, clientId: string = '00000000-0000-0000-0000-000000000000') {
    let user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      // Auto-create user with generated email/phone
      const email = `user-${userId.substring(0, 8)}@kyc-temp.local`;

      // Retry a few times to avoid UNIQUE(phone) collisions in fast sequential calls
      for (let i = 0; i < 3; i++) {
        try {
          user = await this.prisma.user.create({
            data: {
              id: userId,
              clientId, // Use provided clientId (defaults to legacy for backward compatibility)
              externalUserId: userId, // Use internal ID as external ID
              email,
              phone: this.generateTempPhone(),
            },
          });
          break;
        } catch (error) {
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
            // Retry with a new phone value
            continue;
          }
          throw error;
        }
      }

      if (!user) {
        // Last-resort fallback with userId-derived digits to guarantee uniqueness
        const numericFromId = userId.replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
        user = await this.prisma.user.create({
          data: {
            id: userId,
            clientId, // Use provided clientId (defaults to legacy for backward compatibility)
            externalUserId: userId, // Use internal ID as external ID
            email,
            phone: `999${numericFromId}`,
          },
        });
      }
    }

    return user;
  }

  /**
   * Get or Create Submission (Helper)
   *
   * Retrieves most recent submission for user or creates new one if not found.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant isolation
   *
   * @param userId - Internal user UUID
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns KYCSubmission object (existing or newly created)
   * @private
   */
  private async getOrCreateSubmission(userId: string, clientId: string = '00000000-0000-0000-0000-000000000000') {
    let submission = await this.prisma.kYCSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      submission = await this.prisma.kYCSubmission.create({
        data: {
          userId,
          clientId, // Use provided clientId (defaults to legacy for backward compatibility)
          documentSource: DocumentSource.MANUAL_UPLOAD,
          internalStatus: InternalStatus.PENDING,
        },
      });
    }

    return submission;
  }

  /**
   * Trigger Webhook Helper
   *
   * Sends webhook notification to client's configured endpoint with KYC event data.
   * Fetches user details, builds webhook payload, and delegates to WebhookService.
   *
   * **Error Isolation**:
   * - Webhook failures are caught and logged but do NOT throw exceptions
   * - Ensures KYC workflow continues even if client webhook endpoint is down
   * - All delivery attempts logged to WebhookLog table for debugging
   *
   * **Data Mapping**:
   * - `kycSessionId`: Submission ID (for client API correlation)
   * - `externalUserId`: Client's user identifier (from User.externalUserId)
   * - `status`: Current submission status
   * - `extractedData`: OCR results (PAN number, Aadhaar number, name, DOB)
   * - `verificationScores`: Face match and liveness scores (if verification completed)
   * - `rejectionReason`: Admin rejection reason (if applicable)
   *
   * @param submission - KYCSubmission object with updated status
   * @param event - Webhook event type (documents_uploaded, verification_completed, status_changed)
   *
   * @returns Promise<void> - Always resolves (errors caught internally)
   *
   * @private Helper method for KycService webhook triggers
   *
   * @example
   * ```typescript
   * // After document upload completes
   * await this.triggerWebhook(
   *   updated,
   *   WebhookEvent.KYC_DOCUMENTS_UPLOADED
   * );
   *
   * // After face verification completes
   * await this.triggerWebhook(
   *   verified,
   *   WebhookEvent.KYC_VERIFICATION_COMPLETED
   * );
   * ```
   */
  private async triggerWebhook(
    submission: any,
    event: any,
  ): Promise<void> {
    try {
      // Fetch user to get externalUserId and clientId
      const user = await this.prisma.user.findUnique({
        where: { id: submission.userId },
        select: {
          externalUserId: true,
          clientId: true,
        },
      });

      if (!user) {
        // Should never happen (submission references user via FK)
        throw new Error(`User not found for submission ${submission.id}`);
      }

      // Build webhook data payload
      const webhookData: any = {
        kycSessionId: submission.id,
        externalUserId: user.externalUserId,
        status: submission.internalStatus,
      };

      // Include extracted data if available
      if (submission.panNumber || submission.aadhaarNumber || submission.extractedName || submission.dateOfBirth) {
        webhookData.extractedData = {
          panNumber: submission.panNumber || undefined,
          aadhaarNumber: submission.aadhaarNumber || undefined,
          fullName: submission.extractedName || undefined,
          dateOfBirth: submission.dateOfBirth ? submission.dateOfBirth.toISOString().split('T')[0] : undefined,
        };
      }

      // Include verification scores if available
      if (submission.faceMatchScore !== null || submission.livenessScore !== null) {
        webhookData.verificationScores = {
          faceMatchScore: submission.faceMatchScore !== null ? submission.faceMatchScore : undefined,
          livenessScore: submission.livenessScore !== null ? submission.livenessScore : undefined,
        };
      }

      // Include rejection reason if submission was rejected
      if (submission.rejectionReason) {
        webhookData.rejectionReason = submission.rejectionReason;
      }

      // Send webhook (errors caught internally by WebhookService)
      await this.webhookService.sendWebhook(user.clientId, event, webhookData);
    } catch (error) {
      // Log error but don't throw (webhook failures should not break KYC flow)
      console.error(`Failed to trigger webhook for submission ${submission.id}:`, error);
    }
  }

  /**
   * Check and Trigger Documents Uploaded Webhook
   *
   * Centralized helper to detect when all required documents are uploaded
   * and trigger the KYC_DOCUMENTS_UPLOADED webhook. Called from all document
   * upload methods to ensure webhook fires regardless of upload order.
   *
   * **Required Documents**:
   * - PAN document (panDocumentUrl)
   * - Aadhaar (either legacy aadhaarDocumentUrl OR both aadhaarFrontUrl + aadhaarBackUrl)
   * - Live photo (livePhotoUrl)
   *
   * **Trigger Conditions**:
   * - All required documents present
   * - Submission status is DOCUMENTS_UPLOADED
   *
   * @param submission - Updated KYCSubmission object after document upload
   * @returns Promise<void> - Always resolves (errors caught internally)
   * @private Helper method called from all upload paths
   */
  private async checkAndTriggerDocumentsUploadedWebhook(
    submission: any,
  ): Promise<void> {
    try {
      // Check if all required documents are present
      const hasPan = Boolean(submission.panDocumentUrl);
      const hasAadhaar = Boolean(
        submission.aadhaarDocumentUrl ||
        (submission.aadhaarFrontUrl && submission.aadhaarBackUrl)
      );
      const hasLivePhoto = Boolean(submission.livePhotoUrl);

      // Trigger webhook only if all documents uploaded and status is DOCUMENTS_UPLOADED
      if (
        hasPan &&
        hasAadhaar &&
        hasLivePhoto &&
        submission.internalStatus === InternalStatus.DOCUMENTS_UPLOADED
      ) {
        await this.triggerWebhook(submission, WebhookEvent.KYC_DOCUMENTS_UPLOADED);
      }
    } catch (error) {
      // Log error but don't throw (webhook check failures should not break upload flow)
      console.error(`Failed to check/trigger documents uploaded webhook for submission ${submission.id}:`, error);
    }
  }

  private async getSubmissionForUser(userId: string, submissionId?: string) {
    if (submissionId) {
      const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
      if (!submission || submission.userId !== userId) {
        throw new NotFoundException('Submission not found for user');
      }
      return submission;
    }

    const submission = await this.prisma.kYCSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found for user');
    }

    return submission;
  }

  /**
   * Create KYC Submission
   *
   * Creates a new KYC verification submission for a user.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant isolation
   *
   * @param userId - Internal user UUID
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Created KYCSubmission object
   */
  async createSubmission(userId: string, clientId: string = '00000000-0000-0000-0000-000000000000') {
    const user = await this.getOrCreateUser(userId, clientId);
    return this.prisma.kYCSubmission.create({
      data: {
        userId,
        clientId, // Use provided clientId (defaults to legacy for backward compatibility)
        documentSource: DocumentSource.MANUAL_UPLOAD,
        internalStatus: InternalStatus.PENDING,
      },
    });
  }

  async getSubmissionByUserId(userId: string) {
    return this.prisma.kYCSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getKycStatusByUserId(userId: string) {
    const submission = await this.getSubmissionByUserId(userId);
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const progress = this.calculateProgress(submission.internalStatus as PrismaInternalStatus);
    const statusLabel = submission.internalStatus;

    return {
      submission,
      progress,
      statusLabel,
    };
  }

  /**
   * Upload PAN Document
   *
   * Uploads PAN card image to MinIO storage with validation.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal user UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadPanDocument(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Auto-create user if not exists
    const user = await this.getOrCreateUser(userId, clientId);

    // Auto-create submission if not exists
    const submission = await this.getOrCreateSubmission(user.id, clientId);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.PAN_CARD,
      user.clientId,
      user.id,
      uploadDto,
    );

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        panDocumentUrl: objectPath,
        internalStatus: InternalStatus.DOCUMENTS_UPLOADED,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'KYC_DOCUMENT_UPLOAD',
        metadata: { type: 'PAN', objectPath },
      },
    });

    // Check if all documents uploaded and trigger webhook if needed
    await this.checkAndTriggerDocumentsUploadedWebhook(updated);

    return updated;
  }

  /**
   * Upload Aadhaar Document (Legacy)
   *
   * Uploads single-side Aadhaar card image. Prefer uploadAadhaarFront/uploadAadhaarBack.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal user UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadAadhaarDocument(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const user = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(user.id, clientId);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD,
      user.clientId,
      user.id,
      uploadDto,
    );

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        aadhaarDocumentUrl: objectPath,
        internalStatus: InternalStatus.DOCUMENTS_UPLOADED,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'KYC_DOCUMENT_UPLOAD',
        metadata: {
          type: 'AADHAAR',
          objectPath,
        },
      },
    });

    // Check if all documents uploaded and trigger webhook if needed
    await this.checkAndTriggerDocumentsUploadedWebhook(updated);

    return updated;
  }

  /**
   * Upload Aadhaar Front Document
   *
   * Uploads Aadhaar front side (contains photograph for face matching).
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal user UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadAadhaarFront(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const user = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(user.id, clientId);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD_FRONT,
      user.clientId,
      user.id,
      uploadDto,
    );

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        aadhaarFrontUrl: objectPath,
        internalStatus: InternalStatus.DOCUMENTS_UPLOADED,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'KYC_DOCUMENT_UPLOAD',
        metadata: { type: 'AADHAAR_FRONT', objectPath },
      },
    });

    // Check if all documents uploaded and trigger webhook if needed
    await this.checkAndTriggerDocumentsUploadedWebhook(updated);

    return updated;
  }

  /**
   * Upload Aadhaar Back Document
   *
   * Uploads Aadhaar back side (contains address information).
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal user UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadAadhaarBack(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const user = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(user.id, clientId);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD_BACK,
      user.clientId,
      user.id,
      uploadDto,
    );

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        aadhaarBackUrl: objectPath,
        internalStatus: InternalStatus.DOCUMENTS_UPLOADED,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'KYC_DOCUMENT_UPLOAD',
        metadata: { type: 'AADHAAR_BACK', objectPath },
      },
    });

    // Check if all documents uploaded and trigger webhook if needed
    await this.checkAndTriggerDocumentsUploadedWebhook(updated);

    return updated;
  }

  async deletePanDocument(userId: string, submissionId?: string) {
    const submission = await this.getSubmissionForUser(userId, submissionId);
    if (!submission.panDocumentUrl) {
      return submission;
    }

    const { bucket, objectName } = this.parseObjectPath(submission.panDocumentUrl);
    await this.storageService.deleteDocument(bucket, objectName);

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        panDocumentUrl: null,
        internalStatus: this.recomputeInternalStatus({ ...submission, panDocumentUrl: null }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'KYC_DOCUMENT_DELETE',
        metadata: { type: 'PAN', objectPath: submission.panDocumentUrl },
      },
    });

    return updated;
  }

  async deleteAadhaarFront(userId: string, submissionId?: string) {
    const submission = await this.getSubmissionForUser(userId, submissionId);
    if (!submission.aadhaarFrontUrl) {
      return submission;
    }

    const { bucket, objectName } = this.parseObjectPath(submission.aadhaarFrontUrl);
    await this.storageService.deleteDocument(bucket, objectName);

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        aadhaarFrontUrl: null,
        internalStatus: this.recomputeInternalStatus({ ...submission, aadhaarFrontUrl: null }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'KYC_DOCUMENT_DELETE',
        metadata: { type: 'AADHAAR_FRONT', objectPath: submission.aadhaarFrontUrl },
      },
    });

    return updated;
  }

  async deleteAadhaarBack(userId: string, submissionId?: string) {
    const submission = await this.getSubmissionForUser(userId, submissionId);
    if (!submission.aadhaarBackUrl) {
      return submission;
    }

    const { bucket, objectName } = this.parseObjectPath(submission.aadhaarBackUrl);
    await this.storageService.deleteDocument(bucket, objectName);

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        aadhaarBackUrl: null,
        internalStatus: this.recomputeInternalStatus({ ...submission, aadhaarBackUrl: null }),
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId,
        action: 'KYC_DOCUMENT_DELETE',
        metadata: { type: 'AADHAAR_BACK', objectPath: submission.aadhaarBackUrl },
      },
    });

    return updated;
  }

  /**
   * Upload Live Photo Document
   *
   * Uploads user's live photograph for face verification.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal user UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadLivePhotoDocument(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Auto-create user if not exists
    const user = await this.getOrCreateUser(userId, clientId);

    // Auto-create submission if not exists
    const submission = await this.getOrCreateSubmission(user.id, clientId);

    const buffer = await this.prepareFileBuffer(file, IMAGE_ONLY_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.LIVE_PHOTO,
      user.clientId,
      user.id,
      uploadDto,
    );

    const hasAadhaar = submission.aadhaarDocumentUrl || submission.aadhaarFrontUrl || submission.aadhaarBackUrl;
    const shouldMarkUploaded = Boolean(submission.panDocumentUrl && hasAadhaar);

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        livePhotoUrl: objectPath,
        internalStatus: shouldMarkUploaded
          ? InternalStatus.DOCUMENTS_UPLOADED
          : submission.internalStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
          userId: user.id,
        action: 'KYC_LIVE_PHOTO_UPLOAD',
        metadata: { type: 'LIVE_PHOTO', objectPath },
      },
    });

    // Check if all documents uploaded and trigger webhook if needed
    await this.checkAndTriggerDocumentsUploadedWebhook(updated);

    return updated;
  }

  /**
   * Upload Signature Document
   *
   * Uploads user's signature image for verification.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal user UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadSignatureDocument(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const user = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(user.id, clientId);

    const buffer = await this.prepareFileBuffer(file, IMAGE_ONLY_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.SIGNATURE,
      user.clientId,
      user.id,
      uploadDto,
    );

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      // Cast to any to tolerate older generated Prisma clients until migrations are applied
      data: {
        signatureUrl: objectPath,
      } as any,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'KYC_SIGNATURE_UPLOAD',
        metadata: { type: 'SIGNATURE', objectPath },
      },
    });

    return updated;
  }

  async verifyFaceAndUpdate(submissionId: string) {
    const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    const aadhaarUrl = submission.aadhaarDocumentUrl || submission.aadhaarFrontUrl || submission.aadhaarBackUrl;
    if (!submission.panDocumentUrl || !aadhaarUrl || !submission.livePhotoUrl) {
      throw new BadRequestException('Required documents not uploaded');
    }

    const { bucket: panBucket, objectName: panObject } = this.parseObjectPath(submission.panDocumentUrl);
    const aadhaarPathForFace = submission.aadhaarFrontUrl || submission.aadhaarDocumentUrl || submission.aadhaarBackUrl;
    const { bucket: aadhaarBucket, objectName: aadhaarObject } = this.parseObjectPath(aadhaarPathForFace as string);
    const { bucket: liveBucket, objectName: liveObject } = this.parseObjectPath(submission.livePhotoUrl);

    const [panDownload, aadhaarDownload, liveDownload] = await Promise.all([
      this.storageService.downloadDocument(panBucket, panObject),
      this.storageService.downloadDocument(aadhaarBucket, aadhaarObject),
      this.storageService.downloadDocument(liveBucket, liveObject),
    ]);

    const [panBuffer, aadhaarBuffer, liveBuffer] = await Promise.all([
      this.streamToBuffer(panDownload.stream as NodeJS.ReadableStream),
      this.streamToBuffer(aadhaarDownload.stream as NodeJS.ReadableStream),
      this.streamToBuffer(liveDownload.stream as NodeJS.ReadableStream),
    ]);

    const workflowResult = await this.faceRecognitionService.verifyFaceWorkflow(
      liveBuffer,
      panBuffer,
      aadhaarBuffer,
    );

    let internalStatus = submission.internalStatus;
    let rejectionReason = submission.rejectionReason ?? null;

    const facePass = workflowResult.faceMatchScore >= 0.8;
    const livePass = workflowResult.livenessScore >= 0.8;

    if (facePass && livePass) {
      internalStatus = InternalStatus.FACE_VERIFIED;
      rejectionReason = null;
    } else {
      internalStatus = InternalStatus.PENDING_REVIEW;
    }

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submissionId },
      data: {
        faceMatchScore: workflowResult.faceMatchScore,
        livenessScore: workflowResult.livenessScore,
        faceExtractionSuccess: workflowResult.faceExtractionSuccess,
        internalStatus,
        rejectionReason: rejectionReason ?? undefined,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: submission.userId,
        action: 'FACE_VERIFICATION_COMPLETED',
        metadata: {
          submissionId,
          faceMatchScore: workflowResult.faceMatchScore,
          livenessScore: workflowResult.livenessScore,
          verified: workflowResult.verified,
          documentUsed: workflowResult.documentUsed,
        },
      },
    });

    // Trigger webhook after face verification completes (includes verification scores)
    await this.triggerWebhook(updated, WebhookEvent.KYC_VERIFICATION_COMPLETED);

    return updated;
  }

  async extractPanDataAndUpdate(submissionId: string) {
    const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const ocrResult = await this.ocrService.extractPanData(submissionId);
    const existingOcr = this.ensureRecord(submission.ocrResults);
    const mergedOcrResults: Prisma.JsonObject = { ...existingOcr, pan: ocrResult as unknown as Prisma.JsonValue };
    const shouldComplete = Boolean(submission.aadhaarNumber);

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submissionId },
      data: {
        panNumber: ocrResult.panNumber,
        fullName: ocrResult.fullName ?? submission.fullName ?? undefined,
        dateOfBirth: this.parseDate(ocrResult.dateOfBirth) ?? submission.dateOfBirth ?? undefined,
        ocrResults: mergedOcrResults,
        internalStatus: shouldComplete ? InternalStatus.OCR_COMPLETED : submission.internalStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: submission.userId,
        action: 'OCR_PAN_EXTRACT',
        metadata: { submissionId, confidence: ocrResult.confidence },
      },
    });

    return updated;
  }

  async extractAadhaarDataAndUpdate(submissionId: string) {
    const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const ocrResult = await this.ocrService.extractAadhaarData(submissionId);
    const existingOcr = this.ensureRecord(submission.ocrResults);
    const mergedOcrResults: Prisma.JsonObject = { ...existingOcr, aadhaar: ocrResult as unknown as Prisma.JsonValue };
    const shouldComplete = Boolean(submission.panNumber);

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submissionId },
      data: {
        aadhaarNumber: ocrResult.aadhaarNumber,
        fullName: ocrResult.fullName ?? submission.fullName ?? undefined,
        address: ocrResult.address
          ? { formatted: ocrResult.address }
          : submission.address ?? undefined,
        ocrResults: mergedOcrResults,
        internalStatus: shouldComplete ? InternalStatus.OCR_COMPLETED : submission.internalStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: submission.userId,
        action: 'OCR_AADHAAR_EXTRACT',
        metadata: { submissionId, confidence: ocrResult.confidence },
      },
    });

    return updated;
  }

  /**
   * Fetch Documents from DigiLocker
   *
   * Fetches PAN and/or Aadhaar documents from DigiLocker and stores them in MinIO.
   * Updates the submission with document URLs and sets documentSource to DIGILOCKER.
   *
   * @param userId - UUID of the user
   * @param documentTypes - Array of document types to fetch (e.g., ['PAN', 'AADHAAR'])
   * @param submissionId - Optional specific submission ID to update (defaults to most recent)
   * @returns Promise<KYCSubmission> - Updated submission with DigiLocker documents
   *
   * @throws DigiLockerException if user not authorized or documents not found
   * @throws NotFoundException if requested documents not available in DigiLocker
   */
  async fetchDocumentsFromDigiLocker(userId: string, documentTypes: string[], submissionId?: string): Promise<any> {
    // Validate user exists and has DigiLocker authorization
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { client: true },
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    try {
      // Check if user has DigiLocker authorization
      const digiLockerToken = await this.prisma.digiLockerToken.findUnique({
        where: { userId },
      });

      if (!digiLockerToken) {
        throw new BadRequestException('User not authorized with DigiLocker. Please complete OAuth flow first.');
      }

      // Get or create KYC submission
      const submission = submissionId
        ? await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } })
        : await this.getOrCreateSubmission(userId);

      if (!submission) {
        throw new NotFoundException('Submission not found');
      }

      if (submission.userId !== userId) {
        throw new ForbiddenException('Submission does not belong to user');
      }

      // Trigger webhook for fetch initiated
      await this.webhookService.sendWebhook(user.clientId, WebhookEvent.KYC_DIGILOCKER_FETCH_INITIATED, {
        kycSessionId: submission.id,
        externalUserId: user.externalUserId,
        documentTypes,
      });

      // List available documents from DigiLocker
      const availableDocuments = await this.digiLockerDocumentService.listAvailableDocuments(userId);

      // Filter and map document types
      const documentsToFetch: { type: string; digiLockerType: string; documentType: DocumentType }[] = [];

      if (documentTypes.includes('PAN')) {
        const panDoc = availableDocuments.find(doc => doc.type === 'PANCR');
        if (panDoc) {
          documentsToFetch.push({
            type: 'PAN',
            digiLockerType: panDoc.type,
            documentType: DocumentType.PAN_CARD,
          });
        }
      }

      if (documentTypes.includes('AADHAAR')) {
        const aadhaarDoc = availableDocuments.find(doc => doc.type === 'ADHAR');
        if (aadhaarDoc) {
          documentsToFetch.push({
            type: 'AADHAAR',
            digiLockerType: aadhaarDoc.type,
            documentType: DocumentType.AADHAAR_CARD,
          });
        }
      }

      if (documentsToFetch.length === 0) {
        throw new NotFoundException(`Requested documents not found in DigiLocker. Available: ${availableDocuments.map(d => d.type).join(', ')}`);
      }

      // Fetch and store each document
      const fetchedDocuments: string[] = [];
      for (const doc of documentsToFetch) {
        try {
          const objectPath = await this.digiLockerDocumentService.fetchDocument(
            userId,
            doc.digiLockerType === 'PANCR' ? availableDocuments.find(d => d.type === 'PANCR')!.uri :
            availableDocuments.find(d => d.type === 'ADHAR')!.uri,
            doc.documentType
          );

          // Update submission with document URL
          if (doc.type === 'PAN') {
            await this.prisma.kYCSubmission.update({
              where: { id: submission.id },
              data: { panDocumentUrl: objectPath },
            });
          } else if (doc.type === 'AADHAAR') {
            await this.prisma.kYCSubmission.update({
              where: { id: submission.id },
              data: { aadhaarFrontUrl: objectPath },
            });
          }

          fetchedDocuments.push(doc.type);

          // Audit log
          await this.prisma.auditLog.create({
            data: {
              userId,
              action: 'DIGILOCKER_DOCUMENT_FETCHED',
              metadata: { submissionId: submission.id, documentType: doc.type, objectPath },
            },
          });
        } catch (error) {
          this.logger.error(`Failed to fetch ${doc.type} document for user ${userId}`, error);
          // Continue with other documents but log the error
        }
      }

      // Check if any documents were actually fetched
      if (fetchedDocuments.length === 0) {
        throw new NotFoundException('No documents could be fetched from DigiLocker. All requested documents failed to download.');
      }

      // Update submission with DigiLocker source and recompute status
      const updated = await this.prisma.kYCSubmission.update({
        where: { id: submission.id },
        data: {
          documentSource: DocumentSource.DIGILOCKER,
          internalStatus: this.recomputeInternalStatus(await this.prisma.kYCSubmission.findUnique({
            where: { id: submission.id },
          }) as any),
        },
      });

      // Trigger webhook for documents uploaded
      await this.checkAndTriggerDocumentsUploadedWebhook(updated);

      // Trigger DigiLocker fetch completed webhook
      await this.webhookService.sendWebhook(user.clientId, WebhookEvent.KYC_DIGILOCKER_FETCH_COMPLETED, {
        kycSessionId: updated.id,
        externalUserId: user.externalUserId,
        documentsFetched: fetchedDocuments,
        documentUrls: {
          panDocumentUrl: updated.panDocumentUrl,
          aadhaarFrontUrl: updated.aadhaarFrontUrl,
        },
      });

      // Audit log for fetch completion
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'DIGILOCKER_FETCH_COMPLETED',
          metadata: { submissionId: submission.id, fetchedDocuments },
        },
      });

      return { submission: updated, fetchedDocuments };
    } catch (error) {
      // Get submission for webhook if available (may not be available if error occurred early)
      let submissionForWebhook: any = null;
      try {
        submissionForWebhook = submissionId
          ? await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } })
          : await this.getOrCreateSubmission(userId);
      } catch (subError) {
        // Ignore errors when trying to get submission for webhook
      }

      // Trigger DigiLocker fetch failed webhook
      await this.webhookService.sendWebhook(user.clientId, WebhookEvent.KYC_DIGILOCKER_FETCH_FAILED, {
        kycSessionId: submissionForWebhook?.id,
        externalUserId: user.externalUserId,
        documentTypes,
        error: (error as Error).message,
      });

      // Audit log for fetch failure
      await this.prisma.auditLog.create({
        data: {
          userId,
          action: 'DIGILOCKER_FETCH_FAILED',
          metadata: { documentTypes, error: (error as Error).message },
        },
      });
      throw error;
    }
  }

  /**
   * Process DigiLocker Documents
   *
   * Triggers OCR and face verification for DigiLocker-fetched documents.
   *
   * @param submissionId - Submission UUID
   * @returns Promise<KYCSubmission> - Updated submission with OCR results and verification scores
   */
  async processDigiLockerDocuments(submissionId: string): Promise<any> {
    const submission = await this.prisma.kYCSubmission.findUnique({
      where: { id: submissionId },
    });

    if (!submission) {
      throw new NotFoundException(`Submission ${submissionId} not found`);
    }

    // Validate submission has documents
    if (!submission.panDocumentUrl && !submission.aadhaarFrontUrl) {
      throw new BadRequestException('Submission has no documents to process');
    }

    try {
      // Extract PAN data if PAN document exists
      if (submission.panDocumentUrl) {
        await this.extractPanDataAndUpdate(submissionId);
      }
    } catch (error) {
      this.logger.error(`PAN OCR failed for submission ${submissionId}`, error);
    }

    try {
      // Extract Aadhaar data if Aadhaar document exists
      if (submission.aadhaarFrontUrl) {
        await this.extractAadhaarDataAndUpdate(submissionId);
      }
    } catch (error) {
      this.logger.error(`Aadhaar OCR failed for submission ${submissionId}`, error);
    }

    try {
      // Verify face if live photo exists
      if (submission.livePhotoUrl) {
        await this.verifyFaceAndUpdate(submissionId);
      }
    } catch (error) {
      this.logger.error(`Face verification failed for submission ${submissionId}`, error);
    }

    // Return updated submission
    return await this.prisma.kYCSubmission.findUnique({
      where: { id: submissionId },
    });
  }

  /**
   * Get DigiLocker Fetch Status
   *
   * Checks DigiLocker authorization and fetch status for a user.
   *
   * @param userId - User UUID
   * @returns Promise<object> - Status object with authorization and fetch details
   */
  async getDigiLockerFetchStatus(userId: string): Promise<any> {
    try {
      // Check DigiLocker authorization
      const digiLockerToken = await this.prisma.digiLockerToken.findUnique({
        where: { userId },
      });

      const authorized = Boolean(digiLockerToken);

      // Get latest submission
      const submission = await this.prisma.kYCSubmission.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      let availableDocuments: string[] = [];
      if (authorized) {
        try {
          const documents = await this.digiLockerDocumentService.listAvailableDocuments(userId);
          availableDocuments = documents
            .filter(doc => doc.type === 'PANCR' || doc.type === 'ADHAR')
            .map(doc => doc.type === 'PANCR' ? 'PAN' : 'AADHAAR');
        } catch (error) {
          this.logger.warn(`Failed to list DigiLocker documents for user ${userId}`, error);
          // Don't fail the status check if document listing fails
        }
      }

      return {
        authorized,
        documentsFetched: submission?.documentSource === DocumentSource.DIGILOCKER,
        documentSource: submission?.documentSource || DocumentSource.MANUAL_UPLOAD,
        availableDocuments,
        submission,
      };
    } catch (error) {
      this.logger.error(`Failed to get DigiLocker status for user ${userId}`, error);
      return {
        authorized: false,
        documentsFetched: false,
        documentSource: DocumentSource.MANUAL_UPLOAD,
        availableDocuments: [],
        submission: null,
      };
    }
  }

  /**
   * Prepare File Buffer with Validation
   *
   * Validates file type and size before processing. Combines type and size validation
   * into a single operation to fail fast on invalid uploads.
   *
   * **Validation Steps**:
   * 1. File type validation against allowed MIME types
   * 2. File size validation against maximum allowed size (5MB)
   * 3. Buffer conversion from multipart stream
   *
   * **Error Handling**:
   * - BadRequestException: Invalid file type (not in allowedTypes array)
   * - PayloadTooLargeException: File size exceeds 5MB limit
   * - Stream errors: Propagated from file.toBuffer() operation
   *
   * @param file - Multipart file from upload request
   * @param allowedTypes - Array of allowed MIME types (e.g., ['image/jpeg', 'image/png'])
   * @returns Promise<Buffer> - Validated file buffer ready for processing
   *
   * @throws {BadRequestException} When file type is not in allowedTypes
   * @throws {PayloadTooLargeException} When file size exceeds MAX_FILE_SIZE (5MB)
   * @throws {Error} When file.toBuffer() operation fails
   *
   * @private Helper method for all document upload operations
   *
   * @example
   * ```typescript
   * try {
   *   const buffer = await this.prepareFileBuffer(file, ['image/jpeg', 'image/png']);
   *   // Process validated buffer
   * } catch (error) {
   *   if (error instanceof BadRequestException) {
   *     // Handle invalid file type
   *   } else if (error instanceof PayloadTooLargeException) {
   *     // Handle oversized file
   *   }
   * }
   * ```
   */
  private async prepareFileBuffer(file: MultipartFile, allowedTypes: string[]): Promise<Buffer> {
    this.validateFileType(file.mimetype, allowedTypes);

    const buffer = await file.toBuffer();
    this.validateFileSize(buffer.byteLength, MAX_FILE_SIZE);
    return buffer;
  }

  /**
   * Validate File Type Against Allowed MIME Types
   *
   * Ensures uploaded file matches one of the expected MIME types to prevent
   * processing of unsupported file formats or potential security risks.
   *
   * **Supported Types**:
   * - Documents: ['image/jpeg', 'image/png'] (ALLOWED_MIME_TYPES)
   * - Live Photos: ['image/jpeg', 'image/png'] (IMAGE_ONLY_MIME_TYPES)
   * - No PDF support to prevent OCR complexity and ensure image processing
   *
   * **Security Considerations**:
   * - MIME type validation prevents execution of disguised executable files
   * - Limited to image formats reduces attack surface for document processing
   * - Client-side file extensions not trusted (MIME type is server-validated)
   *
   * @param mimetype - File MIME type from multipart upload (e.g., 'image/jpeg')
   * @param allowedTypes - Array of allowed MIME type strings
   *
   * @throws {BadRequestException} When MIME type is not in allowed list
   *
   * @private Validation helper for file uploads
   *
   * @example
   * ```typescript
   * // Usage in document upload
   * try {
   *   this.validateFileType('image/jpeg', ['image/jpeg', 'image/png']);
   *   // File type is valid, continue processing
   * } catch (error) {
   *   // Client receives: "Invalid file type. Allowed: image/jpeg, image/png"
   * }
   * ```
   */
  private validateFileType(mimetype: string, allowedTypes: string[]) {
    if (!allowedTypes.includes(mimetype)) {
      const allowedList = allowedTypes.join(', ');
      throw new BadRequestException(`Invalid file type. Allowed: ${allowedList}`);
    }
  }

  /**
   * Validate File Size Against Maximum Limit
   *
   * Prevents storage of oversized files that could impact system performance
   * or exceed storage quotas. Uses HTTP 413 status for proper client handling.
   *
   * **Size Limits**:
   * - Maximum: 5MB (5,242,880 bytes) defined by MAX_FILE_SIZE constant
   * - Rationale: Balance between image quality and processing performance
   * - Large images are downscaled by Sharp for OCR processing anyway
   *
   * **Storage Optimization**:
   * - MinIO bucket storage costs scale with file sizes
   * - OCR performance degrades with very large images
   * - Face recognition works better with moderately sized images
   *
   * @param size - File size in bytes from buffer.byteLength
   * @param maxSize - Maximum allowed size in bytes (typically MAX_FILE_SIZE)
   *
   * @throws {PayloadTooLargeException} When file size exceeds maxSize limit
   *
   * @private Validation helper for file uploads
   *
   * @example
   * ```typescript
   * try {
   *   this.validateFileSize(buffer.byteLength, 5242880); // 5MB
   *   // File size is acceptable
   * } catch (error) {
   *   // Client receives HTTP 413: "File size exceeds 5MB limit"
   * }
   * ```
   */
  private validateFileSize(size: number, maxSize: number) {
    if (size > maxSize) {
      throw new PayloadTooLargeException('File size exceeds 5MB limit');
    }
  }

  /**
   * Validate Image Dimensions for Processing Compatibility
   *
   * Ensures uploaded images meet minimum and maximum dimension requirements
   * for reliable OCR extraction and face recognition processing.
   *
   * **Dimension Requirements**:
   * - Minimum: 300x300 pixels (MIN_WIDTH × MIN_HEIGHT)
   * - Maximum: 8192x8192 pixels (MAX_WIDTH × MAX_HEIGHT)
   * - Rationale: Balance between processing quality and performance
   *
   * **Processing Considerations**:
   * - OCR accuracy improves with higher resolution (min 300px)
   * - Face detection requires sufficient pixel detail (min 300px)
   * - Excessive resolution slows down processing (max 8192px)
   * - Sharp library handles metadata extraction and dimension validation
   *
   * **Error Handling**:
   * - Non-image files: Skipped (no dimension validation needed)
   * - Corrupt images: Sharp metadata() throws, bubbles up as HTTP 500
   * - Invalid dimensions: BadRequestException with specific requirements
   *
   * @param mimetype - File MIME type (only image/* types are validated)
   * @param buffer - File buffer for Sharp metadata extraction
   *
   * @throws {BadRequestException} When image dimensions are outside allowed range
   * @throws {Error} When Sharp cannot read image metadata (corrupt file)
   *
   * @private Image validation helper
   *
   * @example
   * ```typescript
   * try {
   *   await this.validateImageDimensionsIfNeeded('image/jpeg', buffer);
   *   // Image dimensions are acceptable
   * } catch (error) {
   *   if (error instanceof BadRequestException) {
   *     // Handle dimension error: "Image dimensions must be between 300x300 and 8192x8192"
   *   } else {
   *     // Handle corrupt file or Sharp processing error
   *   }
   * }
   * ```
   */
  private async validateImageDimensionsIfNeeded(mimetype: string, buffer: Buffer) {
    if (!mimetype.startsWith('image/')) {
      return;
    }
    const meta = await sharp(buffer).metadata();
    const width = meta.width ?? 0;
    const height = meta.height ?? 0;
    if (
      width < MIN_WIDTH ||
      height < MIN_HEIGHT ||
      width > MAX_WIDTH ||
      height > MAX_HEIGHT
    ) {
      throw new BadRequestException(`Image dimensions must be between ${MIN_WIDTH}x${MIN_HEIGHT} and ${MAX_WIDTH}x${MAX_HEIGHT}`);
    }
  }

  private parseDate(value?: string): Date | undefined {
    if (!value) {
      return undefined;
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed;
  }

  private calculateProgress(status: PrismaInternalStatus | InternalStatus): number {
    switch (status) {
      case InternalStatus.PENDING:
        return 0;
      case InternalStatus.DOCUMENTS_UPLOADED:
        return 33;
      case InternalStatus.OCR_COMPLETED:
        return 66;
      case InternalStatus.PENDING_REVIEW:
        return 90;
      case InternalStatus.FACE_VERIFIED:
      case InternalStatus.VERIFIED:
      case InternalStatus.REJECTED:
        return 100;
      default:
        return 0;
    }
  }

  private ensureRecord(value: unknown): Prisma.JsonObject {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return value as Prisma.JsonObject;
    }
    return {};
  }

  /**
   * Parse MinIO Object Path from Storage URL
   *
   * Extracts bucket name and object name from stored document URLs for MinIO operations.
   * Used when downloading/deleting documents that were previously uploaded.
   *
   * **URL Format**: "{bucketName}/{objectPath}"
   * - Example: "kyc-pan-cards/client_123/user_456/pan_20240115_103000.jpg"
   * - Bucket: "kyc-pan-cards"
   * - ObjectName: "client_123/user_456/pan_20240115_103000.jpg"
   *
   * **Error Handling**:
   * - Missing bucket or object name results in BadRequestException
   * - Prevents MinIO operations with invalid paths
   * - Critical for document deletion and download operations
   *
   * @param path - Storage path string from database (panDocumentUrl, aadhaarFrontUrl, etc.)
   * @returns Object with bucket and objectName for MinIO operations
   *
   * @throws {BadRequestException} When path format is invalid or components missing
   *
   * @private Helper for MinIO operations
   *
   * @example
   * ```typescript
   * try {
   *   const { bucket, objectName } = this.parseObjectPath("kyc-pan/client/user/file.jpg");
   *   // bucket: "kyc-pan", objectName: "client/user/file.jpg"
   *   await this.storageService.downloadDocument(bucket, objectName);
   * } catch (error) {
   *   // Handle invalid document path error
   * }
   * ```
   */
  private parseObjectPath(path: string): { bucket: string; objectName: string } {
    const [bucket, ...rest] = path.split('/');
    const objectName = rest.join('/');
    if (!bucket || !objectName) {
      throw new BadRequestException('Invalid document path');
    }
    return { bucket, objectName };
  }

  /**
   * Convert Stream to Buffer with Error Handling
   *
   * Converts MinIO download streams to buffers for in-memory processing.
   * Essential for passing document data to OCR and face recognition services.
   *
   * **Stream Processing**:
   * - Collects stream chunks into buffer array
   * - Concatenates chunks into single buffer
   * - Handles stream errors and completion events
   *
   * **Memory Considerations**:
   * - Entire file loaded into memory (limited by 5MB upload size)
   * - Required for TensorFlow.js and Tesseract.js processing
   * - Alternative: Stream processing not supported by ML libraries
   *
   * **Error Scenarios**:
   * - Stream read errors (network issues, MinIO unavailable)
   * - Memory allocation failures (very large files)
   * - Premature stream termination
   *
   * @param stream - Readable stream from MinIO download operation
   * @returns Promise<Buffer> - Complete file buffer for processing
   *
   * @throws {Error} When stream encounters read errors or memory issues
   *
   * @private Helper for document processing
   *
   * @example
   * ```typescript
   * try {
   *   const downloadResult = await this.storageService.downloadDocument(bucket, object);
   *   const buffer = await this.streamToBuffer(downloadResult.stream);
   *   // Use buffer for OCR or face recognition
   * } catch (error) {
   *   // Handle stream conversion or download errors
   * }
   * ```
   */
  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  private recomputeInternalStatus(submission: {
    panDocumentUrl: string | null;
    aadhaarDocumentUrl: string | null;
    aadhaarFrontUrl: string | null;
    aadhaarBackUrl: string | null;
    livePhotoUrl?: string | null;
    internalStatus: PrismaInternalStatus | InternalStatus;
  }): InternalStatus {
    const hasPan = Boolean(submission.panDocumentUrl);
    const hasAadhaar = Boolean(
      submission.aadhaarDocumentUrl || submission.aadhaarFrontUrl || submission.aadhaarBackUrl,
    );

    if (hasPan && hasAadhaar) {
      return InternalStatus.DOCUMENTS_UPLOADED;
    }

    return InternalStatus.PENDING;
  }
}
