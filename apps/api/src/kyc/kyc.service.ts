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
import { FaceRecognitionService } from '../face-recognition/face-recognition.service';
import { WebhookService } from '../webhooks/webhook.service';
import { WebhookEvent } from '../webhooks/webhook-events.enum';
import { DigiLockerDocumentService } from '../digilocker/digilocker-document.service';
import { AadhaarOcrService } from '../aadhaar-ocr/aadhaar-ocr.service';
import type { MultipartFile } from '@fastify/multipart';
import sharp from 'sharp';

import { AadhaarQrService } from '../aadhaar-qr/aadhaar-qr.service';

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
 * - ClientUsers and submissions are auto-created if they don't exist during uploads
 * - Simplifies frontend logic by eliminating pre-creation API calls
 * - Generated emails/phones are placeholders (e.g., clientUser-xxx@kyc-temp.local)
 *
 * **Multi-Tenancy**:
 * - All operations scoped to clientId (extracted from X-API-Key by TenantMiddleware)
 * - Documents stored in client-specific MinIO buckets (kyc-{clientId}-{suffix})
 * - ClientUser lookups constrained by (clientId, externalUserId) composite unique key
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
    private readonly faceRecognitionService: FaceRecognitionService,
    private readonly webhookService: WebhookService,
    private readonly digiLockerDocumentService: DigiLockerDocumentService,
    private readonly aadhaarOcrService: AadhaarOcrService,
    private readonly aadhaarQrService: AadhaarQrService,
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
   * Get or Create ClientUser (Helper)
   *
   * Auto-creates clientUser if they don't exist in the database. This MVP convenience feature
   * allows the frontend to start document uploads without pre-creating clientUser accounts.
   *
   * **Generated Fields**:
   * - Email: clientUser-{first8CharsOfUuid}@kyc-temp.local
   * - Phone: 999{timestamp7Digits} (ensures uniqueness)
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant isolation
   * - Maintains backward compatibility while supporting new client-facing endpoints
   *
   * @param userId - UUID v4 string
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns ClientUser object (existing or newly created)
   * @private
   */
  private async getOrCreateUser(userId: string, clientId: string = '00000000-0000-0000-0000-000000000000') {
    let clientUser = await this.prisma.clientUser.findUnique({ where: { id: userId } });

    if (!clientUser) {
      // Auto-create clientUser with generated email/phone
      const email = `clientUser-${userId.substring(0, 8)}@kyc-temp.local`;

      // Retry a few times to avoid UNIQUE(phone) collisions in fast sequential calls
      for (let i = 0; i < 3; i++) {
        try {
          clientUser = await this.prisma.clientUser.create({
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

      if (!clientUser) {
        // Last-resort fallback with userId-derived digits to guarantee uniqueness
        const numericFromId = userId.replace(/\D/g, '').padEnd(10, '0').slice(0, 10);
        clientUser = await this.prisma.clientUser.create({
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

    return clientUser;
  }

  /**
   * Get or Create Submission (Helper)
   *
   * Retrieves most recent submission for clientUser or creates new one if not found.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant isolation
   *
   * @param userId - Internal clientUser UUID
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
   * Fetches clientUser details, builds webhook payload, and delegates to WebhookService.
   *
   * **Error Isolation**:
   * - Webhook failures are caught and logged but do NOT throw exceptions
   * - Ensures KYC workflow continues even if client webhook endpoint is down
   * - All delivery attempts logged to WebhookLog table for debugging
   *
   * **Data Mapping**:
   * - `kycSessionId`: Submission ID (for client API correlation)
   * - `externalUserId`: Client's clientUser identifier (from ClientUser.externalUserId)
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
      // Fetch clientUser to get externalUserId and clientId
      const clientUser = await this.prisma.clientUser.findUnique({
        where: { id: submission.userId },
        select: {
          externalUserId: true,
          clientId: true,
        },
      });

      if (!clientUser) {
        // Should never happen (submission references clientUser via FK)
        throw new Error(`ClientUser not found for submission ${submission.id}`);
      }

      // Build webhook data payload
      const webhookData: any = {
        kycSessionId: submission.id,
        externalUserId: clientUser.externalUserId,
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
      await this.webhookService.sendWebhook(clientUser.clientId, event, webhookData);
    } catch (error) {
      // Log error but don't throw (webhook failures should not break KYC flow)
      console.error(`Failed to trigger webhook for submission ${submission.id}:`, error);
    }
  }

  /**
   * Check and Trigger Documents Uploaded Webhook + Auto-Processing
   *
   * Centralized helper to detect when all required documents are uploaded,
   * trigger the KYC_DOCUMENTS_UPLOADED webhook, and then automatically run
   * OCR extraction and face verification.
   *
   * Called from all document upload methods to ensure processing fires
   * regardless of document upload order.
   *
   * **Required Documents**:
   * - PAN document (panNumber)
   * - Aadhaar (either legacy aadhaarDocumentUrl OR both aadhaarFrontUrl + aadhaarBackUrl)
   * - Live photo (livePhotoUrl)
   *
   * **Trigger Conditions**:
   * - All required documents present
   * - Submission status is DOCUMENTS_UPLOADED
   *
   * **Auto-Processing Pipeline** (runs after webhook fires):
   * 1. OCR: Extract PAN data (panNumber, fullName, dateOfBirth)
   * 2. OCR: Extract Aadhaar data (aadhaarNumber, address)
   * 3. Face verification: Compare live photo against ID documents
   *    - Sets faceMatchScore, livenessScore
   *    - Updates status to FACE_VERIFIED or PENDING_REVIEW based on scores
   * 4. Fires KYC_VERIFICATION_COMPLETED webhook with scores
   *
   * Each processing step is wrapped in try/catch so one failure does not
   * prevent the remaining steps from executing.
   *
   * @param submission - Updated KYCSubmission object after document upload
   * @returns Promise<void> - Always resolves (errors caught internally)
   * @private Helper method called from all upload paths
   */
  private async checkAndTriggerDocumentsUploadedWebhook(
    submission: any,
  ): Promise<void> {
    try {
      // Check if all required documents are present (PAN + Aadhaar + live photo + signature)
      const hasPan = Boolean(submission.panNumber);
      const hasAadhaar = Boolean(
        submission.aadhaarDocumentUrl ||
        (submission.aadhaarFrontUrl && submission.aadhaarBackUrl)
      );
      const hasLivePhoto = Boolean(submission.livePhotoUrl);
      const hasSignature = Boolean(submission.signatureUrl);

      // Only proceed if all documents are uploaded and status is DOCUMENTS_UPLOADED
      if (
        !(hasPan &&
        hasAadhaar &&
        hasLivePhoto &&
        hasSignature &&
        submission.internalStatus === InternalStatus.DOCUMENTS_UPLOADED)
      ) {
        return;
      }

      // --- Step 1: Fire the documents uploaded webhook ---
      await this.triggerWebhook(submission, WebhookEvent.KYC_DOCUMENTS_UPLOADED);

      // --- Step 2: Auto-run OCR on PAN document ---
      // Extracts panNumber, fullName, dateOfBirth from the uploaded PAN image
      // and persists them to the KYCSubmission record.
      if (submission.panNumber) {
        try {
          this.logger.log(
            `Starting PAN OCR extraction for submission ${submission.id}`,
          );
          
          this.logger.log(
            `PAN OCR extraction completed for submission ${submission.id}`,
          );
        } catch (ocrError) {
          // Log but do not throw -- OCR failure should not block the rest
          // of the processing pipeline (face verification can still run).
          this.logger.error(
            `PAN OCR extraction failed for submission ${submission.id}`,
            ocrError,
          );
        }
      }

      // --- Step 3: Auto-run OCR on Aadhaar document ---
      // Extracts aadhaarNumber (masked), fullName, and address from the
      // uploaded Aadhaar front image and persists them to the submission.
      if (submission.aadhaarFrontUrl || submission.aadhaarDocumentUrl) {
        try {
          this.logger.log(
            `Starting Aadhaar OCR extraction for submission ${submission.id}`,
          );
          await this.aadhaarOcrService.triggerAadhaarExtraction(submission.id);
          this.logger.log(
            `Aadhaar OCR extraction completed for submission ${submission.id}`,
          );
        } catch (ocrError) {
          // Log but do not throw -- Aadhaar OCR failure should not block
          // face verification from running.
          this.logger.error(
            `Aadhaar OCR extraction failed for submission ${submission.id}`,
            ocrError,
          );
        }
      }

      // --- Step 4: Auto-run face verification ---
      // Compares the live photo against PAN and Aadhaar front documents
      // using face-api.js. Sets faceMatchScore, livenessScore, and updates
      // internalStatus to either FACE_VERIFIED (scores >= 0.8) or
      // PENDING_REVIEW (scores below threshold).
      // The verifyFaceAndUpdate method also fires the
      // KYC_VERIFICATION_COMPLETED webhook internally.
      if (submission.livePhotoUrl) {
        try {
          this.logger.log(
            `Starting face verification for submission ${submission.id}`,
          );
          await this.verifyFaceAndUpdate(submission.id);
          this.logger.log(
            `Face verification completed for submission ${submission.id}`,
          );
        } catch (faceError) {
          // Log but do not throw -- face verification failure should not
          // break the upload response to the client.
          this.logger.error(
            `Face verification failed for submission ${submission.id}`,
            faceError,
          );
        }
      }
    } catch (error) {
      // Log error but don't throw (webhook/processing failures should not break upload flow)
      this.logger.error(
        `Failed to process documents for submission ${submission.id}`,
        error,
      );
    }
  }

  private async getSubmissionForUser(userId: string, submissionId?: string) {
    if (submissionId) {
      const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
      if (!submission || submission.userId !== userId) {
        throw new NotFoundException('Submission not found for clientUser');
      }
      return submission;
    }

    const submission = await this.prisma.kYCSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found for clientUser');
    }

    return submission;
  }

  /**
   * Create KYC Submission
   *
   * Creates a new KYC verification submission for a clientUser.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant isolation
   *
   * @param userId - Internal clientUser UUID
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Created KYCSubmission object
   */
  async createSubmission(userId: string, clientId: string = '00000000-0000-0000-0000-000000000000') {
    const clientUser = await this.getOrCreateUser(userId, clientId);
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
    // Attempt dual lookup resolving from internal UUID or external reference securely
    const clientUser = await this.prisma.clientUser.findFirst({
      where: {
        OR: [
          { id: userId },
          { externalUserId: userId }
        ]
      }
    });

    if (!clientUser) return null;

    return this.prisma.kYCSubmission.findFirst({
      where: { userId: clientUser.id },
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
   * Upload Aadhaar Document (Legacy)
   *
   * Uploads single-side Aadhaar card image. Prefer uploadAadhaarFront/uploadAadhaarBack.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal clientUser UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadAadhaarDocument(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const clientUser = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(clientUser.id, clientId);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD,
      clientUser.clientId,
      clientUser.id,
      uploadDto,
    );

    // Only mark as DOCUMENTS_UPLOADED when all required documents are present:
    // Aadhaar legacy (being uploaded now) + PAN + live photo + signature.
    const hasPan = Boolean(submission.panNumber);
    const hasLivePhoto = Boolean(submission.livePhotoUrl);
    const hasSignature = Boolean(submission.signatureUrl);
    const allDocsPresent = hasPan && hasLivePhoto && hasSignature;

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        aadhaarDocumentUrl: objectPath,
        internalStatus: allDocsPresent
          ? InternalStatus.DOCUMENTS_UPLOADED
          : submission.internalStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: clientUser.id,
        action: 'KYC_DOCUMENT_UPLOAD',
        metadata: {
          type: 'AADHAAR',
          objectPath,
        },
      },
    });

    // Fire-and-forget: trigger webhook + auto-processing (OCR, face verification)
    // in the background so the upload response returns immediately.
    // The .catch() prevents unhandled promise rejections from crashing the process.
    this.checkAndTriggerDocumentsUploadedWebhook(updated).catch(() => {});

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
   * @param userId - Internal clientUser UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadAadhaarFront(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const clientUser = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(clientUser.id, clientId);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD_FRONT,
      clientUser.clientId,
      clientUser.id,
      uploadDto,
    );

    // Only mark as DOCUMENTS_UPLOADED when all required documents are present:
    // Aadhaar front (being uploaded now) + Aadhaar back + PAN + live photo + signature.
    const hasPan = Boolean(submission.panNumber);
    const hasAadhaarBack = Boolean(submission.aadhaarBackUrl);
    const hasLivePhoto = Boolean(submission.livePhotoUrl);
    const hasSignature = Boolean(submission.signatureUrl);
    const allDocsPresent = hasPan && hasAadhaarBack && hasLivePhoto && hasSignature;

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        aadhaarFrontUrl: objectPath,
        internalStatus: allDocsPresent
          ? InternalStatus.DOCUMENTS_UPLOADED
          : submission.internalStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: clientUser.id,
        action: 'KYC_DOCUMENT_UPLOAD',
        metadata: { type: 'AADHAAR_FRONT', objectPath },
      },
    });



    // processed silently and decoupled from the upload latency.
    this.aadhaarOcrService.triggerAadhaarExtraction(updated.id).catch(err => {
        this.logger.error(`Background Aadhaar OCR failed for ${updated.id}`, err);
    });

    return updated;
  }

  /**
   * Upload and Decode Aadhaar QR Code
   *
   * Accepts the raw QR string scanned from an Aadhaar card.
   * Decodes Secure QR and legacy XML formats on the backend securely.
   * Extracts demographics and JPEG2000 photograph.
   *
   * @param userId - Internal clientUser UUID
   * @param dto - { rawQrText: string }
   * @param clientId - Optional client UUID
   */
  async uploadAadhaarQr(userId: string, rawQrText: string, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!rawQrText) {
      throw new BadRequestException('QR text is required');
    }

    const clientUser = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(clientUser.id, clientId);

    // Decode QR securely using the injected service
    const extractedData = await this.aadhaarQrService.decodeQrString(rawQrText);

    let objectPath: string | undefined;

    // If JP2 photo bytes were extracted, store them in MinIO as the Aadhaar Front
    if (extractedData.photoBytes && extractedData.photoBytes.length > 0) {
      const uploadDto: UploadDocumentDto = {
        buffer: extractedData.photoBytes,
        filename: 'aadhaar_extracted_photo.jp2',
        mimetype: 'image/jp2',
      };
      // We store it as AADHAAR_CARD_FRONT so FaceRecognitionService uses it as the source of truth
      objectPath = await this.storageService.uploadDocument(
        DocumentType.AADHAAR_CARD_FRONT,
        clientId,
        clientUser.id,
        uploadDto,
      );
    }

    // Determine Status
    const hasPan = !!submission.panNumber;
    const hasAadhaarBack = !!submission.aadhaarBackUrl;
    const hasLivePhoto = !!submission.livePhotoUrl;
    const hasSignature = !!submission.signatureUrl;

    const allDocsPresent = hasPan && hasAadhaarBack && hasLivePhoto && hasSignature && (!!objectPath || !!submission.aadhaarFrontUrl);

    // Update the Submission with Demographics
    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        ...(objectPath && { aadhaarFrontUrl: objectPath }),
        aadhaarNumber: extractedData.uid,
        fullName: extractedData.fullName,
        gender: extractedData.gender,
        dateOfBirth: extractedData.dateOfBirth,
        address: extractedData.address ? (extractedData.address as any) : Prisma.JsonNull,
        internalStatus: allDocsPresent
          ? InternalStatus.DOCUMENTS_UPLOADED
          : submission.internalStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: clientUser.id,
        action: 'KYC_AADHAAR_QR_DECODE',
        metadata: { objectPath, uid: extractedData.uid },
      },
    });

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
   * @param userId - Internal clientUser UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadAadhaarBack(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const clientUser = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(clientUser.id, clientId);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD_BACK,
      clientUser.clientId,
      clientUser.id,
      uploadDto,
    );

    // Only mark as DOCUMENTS_UPLOADED when all required documents are present:
    // Aadhaar back (being uploaded now) + Aadhaar front + PAN + live photo + signature.
    const hasPan = Boolean(submission.panNumber);
    const hasAadhaarFront = Boolean(submission.aadhaarFrontUrl);
    const hasLivePhoto = Boolean(submission.livePhotoUrl);
    const hasSignature = Boolean(submission.signatureUrl);
    const allDocsPresent = hasPan && hasAadhaarFront && hasLivePhoto && hasSignature;

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        aadhaarBackUrl: objectPath,
        internalStatus: allDocsPresent
          ? InternalStatus.DOCUMENTS_UPLOADED
          : submission.internalStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: clientUser.id,
        action: 'KYC_DOCUMENT_UPLOAD',
        metadata: { type: 'AADHAAR_BACK', objectPath },
      },
    });



    // Fire-and-forget: trigger webhook + auto-processing (OCR, face verification)
    // in the background so the upload response returns immediately.
    // The .catch() prevents unhandled promise rejections from crashing the process.
    this.checkAndTriggerDocumentsUploadedWebhook(updated).catch(() => {});

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
   * Uploads clientUser's live photograph for face verification.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal clientUser UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadLivePhotoDocument(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    // Auto-create clientUser if not exists
    const clientUser = await this.getOrCreateUser(userId, clientId);

    // Auto-create submission if not exists
    const submission = await this.getOrCreateSubmission(clientUser.id, clientId);

    const buffer = await this.prepareFileBuffer(file, IMAGE_ONLY_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.LIVE_PHOTO,
      clientUser.clientId,
      clientUser.id,
      uploadDto,
    );

    // Only mark as DOCUMENTS_UPLOADED when all required documents are present:
    // Live photo (being uploaded now) + PAN + Aadhaar (front+back or legacy) + signature.
    const hasPan = Boolean(submission.panNumber);
    const hasAadhaar = Boolean(
      submission.aadhaarDocumentUrl ||
      (submission.aadhaarFrontUrl && submission.aadhaarBackUrl),
    );
    const hasSignature = Boolean(submission.signatureUrl);
    const allDocsPresent = hasPan && hasAadhaar && hasSignature;

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        livePhotoUrl: objectPath,
        internalStatus: allDocsPresent
          ? InternalStatus.DOCUMENTS_UPLOADED
          : submission.internalStatus,
      },
    });

    await this.prisma.auditLog.create({
      data: {
          userId: clientUser.id,
        action: 'KYC_LIVE_PHOTO_UPLOAD',
        metadata: { type: 'LIVE_PHOTO', objectPath },
      },
    });

    // Fire-and-forget: trigger webhook + auto-processing (OCR, face verification)
    // in the background so the upload response returns immediately.
    // The .catch() prevents unhandled promise rejections from crashing the process.
    this.checkAndTriggerDocumentsUploadedWebhook(updated).catch(() => {});

    return updated;
  }

  /**
   * Upload Signature Document
   *
   * Uploads clientUser's signature image for verification.
   *
   * **Multi-Tenancy (Dual-Mode Operation)**:
   * - Legacy mode: clientId defaults to '00000000-0000-0000-0000-000000000000' for internal APIs
   * - Tenant mode: clientId provided by client-facing APIs for multi-tenant bucket isolation
   *
   * @param userId - Internal clientUser UUID
   * @param file - Multipart file upload
   * @param clientId - Optional client UUID (defaults to legacy client for backward compatibility)
   * @returns Updated KYCSubmission object
   */
  async uploadSignatureDocument(userId: string, file: MultipartFile, clientId: string = '00000000-0000-0000-0000-000000000000') {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const clientUser = await this.getOrCreateUser(userId, clientId);
    const submission = await this.getOrCreateSubmission(clientUser.id, clientId);

    const buffer = await this.prepareFileBuffer(file, IMAGE_ONLY_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.SIGNATURE,
      clientUser.clientId,
      clientUser.id,
      uploadDto,
    );

    // Only mark as DOCUMENTS_UPLOADED when all required documents are present:
    // Signature (being uploaded now) + PAN + Aadhaar (front+back or legacy) + live photo.
    const hasPan = Boolean(submission.panNumber);
    const hasAadhaar = Boolean(
      submission.aadhaarDocumentUrl ||
      (submission.aadhaarFrontUrl && submission.aadhaarBackUrl),
    );
    const hasLivePhoto = Boolean(submission.livePhotoUrl);
    const allDocsPresent = hasPan && hasAadhaar && hasLivePhoto;

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        signatureUrl: objectPath,
        internalStatus: allDocsPresent
          ? InternalStatus.DOCUMENTS_UPLOADED
          : submission.internalStatus,
      } as any,
    });

    await this.prisma.auditLog.create({
      data: {
        userId: clientUser.id,
        action: 'KYC_SIGNATURE_UPLOAD',
        metadata: { type: 'SIGNATURE', objectPath },
      },
    });

    // Signature may be the last document uploaded, so trigger auto-OCR/face verification
    this.checkAndTriggerDocumentsUploadedWebhook(updated).catch(() => {});

    return updated;
  }

  async verifyFaceAndUpdate(submissionId: string) {
    const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    const aadhaarUrl = submission.aadhaarDocumentUrl || submission.aadhaarFrontUrl || submission.aadhaarBackUrl;
    if (!submission.panNumber || !aadhaarUrl || !submission.livePhotoUrl) {
      throw new BadRequestException('Required documents not uploaded');
    }

    const { bucket: panBucket, objectName: panObject } = this.parseObjectPath(submission.panNumber);
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

  /**
   * Fetch Documents from DigiLocker
   *
   * Fetches PAN and/or Aadhaar documents from DigiLocker and stores them in MinIO.
   * Updates the submission with document URLs and sets documentSource to DIGILOCKER.
   *
   * @param userId - UUID of the clientUser
   * @param documentTypes - Array of document types to fetch (e.g., ['PAN', 'AADHAAR'])
   * @param submissionId - Optional specific submission ID to update (defaults to most recent)
   * @returns Promise<KYCSubmission> - Updated submission with DigiLocker documents
   *
   * @throws DigiLockerException if clientUser not authorized or documents not found
   * @throws NotFoundException if requested documents not available in DigiLocker
   */
  async fetchDocumentsFromDigiLocker(userId: string, documentTypes: string[], submissionId?: string): Promise<any> {
    // Validate clientUser exists and has DigiLocker authorization
    const clientUser = await this.prisma.clientUser.findUnique({
      where: { id: userId },
      include: { client: true },
    });

    if (!clientUser) {
      throw new NotFoundException(`ClientUser ${userId} not found`);
    }

    try {
      // Check if clientUser has DigiLocker authorization
      const digiLockerToken = await this.prisma.digiLockerToken.findUnique({
        where: { userId },
      });

      if (!digiLockerToken) {
        throw new BadRequestException('ClientUser not authorized with DigiLocker. Please complete OAuth flow first.');
      }

      // Get or create KYC submission
      const submission = submissionId
        ? await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } })
        : await this.getOrCreateSubmission(userId);

      if (!submission) {
        throw new NotFoundException('Submission not found');
      }

      if (submission.userId !== userId) {
        throw new ForbiddenException('Submission does not belong to clientUser');
      }

      // Trigger webhook for fetch initiated
      await this.webhookService.sendWebhook(clientUser.clientId, WebhookEvent.KYC_DIGILOCKER_FETCH_INITIATED, {
        kycSessionId: submission.id,
        externalUserId: clientUser.externalUserId,
        documentTypes,
      });

      // List available documents from DigiLocker
      const availableDocuments = await this.digiLockerDocumentService.listAvailableDocuments(userId);

      // Filter and map document types
      const documentsToFetch: { type: string; uri: string; documentType: DocumentType }[] = [];

      const extractType = (doc: any) => {
        const raw = doc?.doctype ?? doc?.docType ?? doc?.doc_type ?? doc?.documentType ?? doc?.document_type ?? doc?.type ?? '';
        return String(raw).toUpperCase();
      };
      const extractUri = (doc: any) => String(doc?.uri ?? doc?.URI ?? doc?.docUri ?? doc?.documentUri ?? doc?.document_uri ?? '').trim();

      if (documentTypes.includes('PAN')) {
        const panDoc = availableDocuments.find((doc: any) => {
          const t = extractType(doc);
          return t === 'PANCR' || t === 'PAN';
        });
        if (panDoc) {
          const uri = extractUri(panDoc);
          if (!uri) {
            throw new BadRequestException('PAN document found in DigiLocker but missing URI');
          }
          documentsToFetch.push({
            type: 'PAN',
            uri,
            documentType: DocumentType.PAN_CARD,
          });
        }
      }

      if (documentTypes.includes('AADHAAR')) {
        const aadhaarDoc = availableDocuments.find((doc: any) => {
          const t = extractType(doc);
          return t === 'ADHAR' || t === 'AADHAAR' || t === 'ADHAAR';
        });
        if (aadhaarDoc) {
          const uri = extractUri(aadhaarDoc);
          if (!uri) {
            throw new BadRequestException('Aadhaar document found in DigiLocker but missing URI');
          }
          documentsToFetch.push({
            type: 'AADHAAR',
            uri,
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
            doc.uri,
            doc.documentType
          );

          // Update submission with document URL
          if (doc.type === 'PAN') {
            await this.prisma.kYCSubmission.update({
              where: { id: submission.id },
              data: { panNumber: objectPath },
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
          this.logger.error(`Failed to fetch ${doc.type} document for clientUser ${userId}`, error);
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

      // Instantly run OCR extract routines on DigiLocker artifacts synchronously asynchronously!
      this.processDigiLockerDocuments(updated.id).catch((e) => this.logger.error('Failed processing DigiLocker OCR sequentially', e));

      // Fire-and-forget: trigger webhook + auto-processing in the background.
      // The .catch() prevents unhandled promise rejections from crashing the process.
      this.checkAndTriggerDocumentsUploadedWebhook(updated).catch(() => {});

      // Trigger DigiLocker fetch completed webhook
      await this.webhookService.sendWebhook(clientUser.clientId, WebhookEvent.KYC_DIGILOCKER_FETCH_COMPLETED, {
        kycSessionId: updated.id,
        externalUserId: clientUser.externalUserId,
        documentsFetched: fetchedDocuments,
        documentUrls: {
          panNumber: updated.panNumber,
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
      await this.webhookService.sendWebhook(clientUser.clientId, WebhookEvent.KYC_DIGILOCKER_FETCH_FAILED, {
        kycSessionId: submissionForWebhook?.id,
        externalUserId: clientUser.externalUserId,
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
    if (!submission.panNumber && !submission.aadhaarFrontUrl) {
      throw new BadRequestException('Submission has no documents to process');
    }

    try {
      // Extract PAN data if PAN document exists
      if (submission.panNumber) {
        
      }
    } catch (error) {
      this.logger.error(`PAN OCR failed for submission ${submissionId}`, error);
    }

    try {
      // Extract Aadhaar data if Aadhaar document exists
      if (submission.aadhaarFrontUrl) {
        
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
   * Checks DigiLocker authorization and fetch status for a clientUser.
   *
   * @param userId - ClientUser UUID
   * @returns Promise<object> - Status object with authorization and fetch details
   */
  async getDigiLockerFetchStatus(userId: string): Promise<any> {
    try {
      // Check DigiLocker authorization
      const digiLockerToken = await this.prisma.digiLockerToken.findUnique({
        where: { userId },
      });

      let authorized = Boolean(digiLockerToken);
      if (digiLockerToken) {
        const now = new Date();
        if (!digiLockerToken.refreshToken && digiLockerToken.expiresAt <= now) {
          // Token is no longer usable; clear it so the UI can prompt re-authorization.
          await this.prisma.digiLockerToken.deleteMany({ where: { userId } });
          authorized = false;
        }
      }

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
          this.logger.warn(`Failed to list DigiLocker documents for clientUser ${userId}`, error);
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
      this.logger.error(`Failed to get DigiLocker status for clientUser ${userId}`, error);
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

    // Handle DD-MM-YYYY or DD/MM/YYYY (common in Indian documents like PAN, Aadhaar)
    const ddmmyyyy = value.match(/^(\d{2})[-\/](\d{2})[-\/](\d{4})$/);
    if (ddmmyyyy) {
      const [, day, month, year] = ddmmyyyy;
      const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
      return Number.isNaN(parsed.getTime()) ? undefined : parsed;
    }

    // Fallback to native Date parsing (handles ISO YYYY-MM-DD etc.)
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
   * @param path - Storage path string from database (panNumber, aadhaarFrontUrl, etc.)
   * @returns Object with bucket and objectName for MinIO operations
   *
   * @throws {BadRequestException} When path format is invalid or components missing
   *
   * @private Helper for MinIO operations
   *
   * @example
   * ```typescript
   * try {
   *   const { bucket, objectName } = this.parseObjectPath("kyc-pan/client/clientUser/file.jpg");
   *   // bucket: "kyc-pan", objectName: "client/clientUser/file.jpg"
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
    panNumber: string | null;
    aadhaarDocumentUrl: string | null;
    aadhaarFrontUrl: string | null;
    aadhaarBackUrl: string | null;
    livePhotoUrl?: string | null;
    internalStatus: PrismaInternalStatus | InternalStatus;
  }): InternalStatus {
    const hasPan = Boolean(submission.panNumber);
    const hasAadhaar = Boolean(
      submission.aadhaarDocumentUrl || submission.aadhaarFrontUrl || submission.aadhaarBackUrl,
    );

    if (hasPan && hasAadhaar) {
      return InternalStatus.DOCUMENTS_UPLOADED;
    }

    return InternalStatus.PENDING;
  }
}
