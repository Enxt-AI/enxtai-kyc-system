import {
  BadRequestException,
  Injectable,
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
 * @see {@link StorageService} for MinIO S3 operations
 * @see {@link OcrService} for Tesseract.js OCR integration
 * @see {@link FaceRecognitionService} for face-api.js verification
 */
@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
    private readonly faceRecognitionService: FaceRecognitionService,
  ) {}

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
   * @param userId - UUID v4 string
   * @returns User object (existing or newly created)
   * @private
   */
  private async getOrCreateUser(userId: string) {
    let user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      // Auto-create user with generated email/phone
      const timestamp = Date.now();
      user = await this.prisma.user.create({
        data: {
          id: userId,
          email: `user-${userId.substring(0, 8)}@kyc-temp.local`,
          phone: `999${timestamp.toString().substring(0, 7)}`, // Generate unique phone
        },
      });
    }

    return user;
  }

  // Helper: Get or create submission
  private async getOrCreateSubmission(userId: string) {
    let submission = await this.prisma.kYCSubmission.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    if (!submission) {
      submission = await this.prisma.kYCSubmission.create({
        data: {
          userId,
          documentSource: DocumentSource.MANUAL_UPLOAD,
          internalStatus: InternalStatus.PENDING,
        },
      });
    }

    return submission;
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

  async createSubmission(userId: string) {
    const user = await this.getOrCreateUser(userId);
    return this.prisma.kYCSubmission.create({
      data: {
        userId,
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

  async uploadPanDocument(userId: string, file: MultipartFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    
    // Auto-create user if not exists
    const user = await this.getOrCreateUser(userId);

    // Auto-create submission if not exists
    const submission = await this.getOrCreateSubmission(user.id);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.PAN_CARD,
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

    return updated;
  }

  async uploadAadhaarDocument(userId: string, file: MultipartFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    
    // Auto-create user if not exists
    const user = await this.getOrCreateUser(userId);

    // Auto-create submission if not exists
    const submission = await this.getOrCreateSubmission(user.id);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD,
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

    return updated;
  }

  async uploadAadhaarFront(userId: string, file: MultipartFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const user = await this.getOrCreateUser(userId);
    const submission = await this.getOrCreateSubmission(user.id);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD_FRONT,
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

    return updated;
  }

  async uploadAadhaarBack(userId: string, file: MultipartFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const user = await this.getOrCreateUser(userId);
    const submission = await this.getOrCreateSubmission(user.id);

    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD_BACK,
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

  async uploadLivePhotoDocument(userId: string, file: MultipartFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    
    // Auto-create user if not exists
    const user = await this.getOrCreateUser(userId);

    // Auto-create submission if not exists
    const submission = await this.getOrCreateSubmission(user.id);

    const buffer = await this.prepareFileBuffer(file, IMAGE_ONLY_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.LIVE_PHOTO,
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

  private async prepareFileBuffer(file: MultipartFile, allowedTypes: string[]): Promise<Buffer> {
    this.validateFileType(file.mimetype, allowedTypes);

    const buffer = await file.toBuffer();
    this.validateFileSize(buffer.byteLength, MAX_FILE_SIZE);
    return buffer;
  }

  private validateFileType(mimetype: string, allowedTypes: string[]) {
    if (!allowedTypes.includes(mimetype)) {
      const allowedList = allowedTypes.join(', ');
      throw new BadRequestException(`Invalid file type. Allowed: ${allowedList}`);
    }
  }

  private validateFileSize(size: number, maxSize: number) {
    if (size > maxSize) {
      throw new PayloadTooLargeException('File size exceeds 5MB limit');
    }
  }

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

  private parseObjectPath(path: string): { bucket: string; objectName: string } {
    const [bucket, ...rest] = path.split('/');
    const objectName = rest.join('/');
    if (!bucket || !objectName) {
      throw new BadRequestException('Invalid document path');
    }
    return { bucket, objectName };
  }

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
