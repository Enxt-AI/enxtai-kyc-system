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

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png'];
const IMAGE_ONLY_MIME_TYPES = ['image/jpeg', 'image/png'];
const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;
const MAX_WIDTH = 4096;
const MAX_HEIGHT = 4096;

@Injectable()
export class KycService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly ocrService: OcrService,
    private readonly faceRecognitionService: FaceRecognitionService,
  ) {}

  async createSubmission(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

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
    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const submission = (await this.getSubmissionByUserId(userId)) ?? (await this.createSubmission(userId));

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.PAN_CARD,
      userId,
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
        userId,
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
    const buffer = await this.prepareFileBuffer(file, ALLOWED_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const submission = (await this.getSubmissionByUserId(userId)) ?? (await this.createSubmission(userId));

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.AADHAAR_CARD,
      userId,
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
        userId,
        action: 'KYC_DOCUMENT_UPLOAD',
        metadata: { type: 'AADHAAR', objectPath },
      },
    });

    return updated;
  }

  async uploadLivePhotoDocument(userId: string, file: MultipartFile) {
    if (!file) {
      throw new BadRequestException('File is required');
    }
    const buffer = await this.prepareFileBuffer(file, IMAGE_ONLY_MIME_TYPES);
    await this.validateImageDimensionsIfNeeded(file.mimetype, buffer);

    const submission = (await this.getSubmissionByUserId(userId)) ?? (await this.createSubmission(userId));

    const uploadDto: UploadDocumentDto = {
      buffer,
      filename: file.filename,
      mimetype: file.mimetype,
    };

    const objectPath = await this.storageService.uploadDocument(
      DocumentType.LIVE_PHOTO,
      userId,
      uploadDto,
    );

    const shouldMarkUploaded = Boolean(
      submission.panDocumentUrl && submission.aadhaarDocumentUrl,
    );

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
        userId,
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
    if (!submission.panDocumentUrl || !submission.aadhaarDocumentUrl || !submission.livePhotoUrl) {
      throw new BadRequestException('Required documents not uploaded');
    }

    const { bucket: panBucket, objectName: panObject } = this.parseObjectPath(submission.panDocumentUrl);
    const { bucket: aadhaarBucket, objectName: aadhaarObject } = this.parseObjectPath(
      submission.aadhaarDocumentUrl,
    );
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
      throw new BadRequestException('Image dimensions must be between 800x600 and 4096x4096');
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
}
