import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import {
  AADHAAR_CARDS_BUCKET,
  ENCRYPTION_ALGORITHM,
  LIVE_PHOTOS_BUCKET,
  MAX_FILE_SIZE,
  PAN_CARDS_BUCKET,
  PRESIGNED_URL_EXPIRY,
} from './storage.constants';
import {
  DocumentType,
  DownloadDocumentResult,
  StorageConfig,
  UploadDocumentDto,
} from './storage.types';
import { StorageUploadException } from './exceptions/storage-upload.exception';
import { StorageDownloadException } from './exceptions/storage-download.exception';
import { StorageDeleteException } from './exceptions/storage-delete.exception';
import { StoragePresignedUrlException } from './exceptions/storage-presigned-url.exception';

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly minio: MinioClient;
  private readonly buckets: string[];
  private readonly panBucket: string;
  private readonly aadhaarBucket: string;
  private readonly livePhotosBucket: string;
  private readonly bucketEncryptionConfig: { Rule: any[] };
  private readonly enableBucketEncryption: boolean;

  constructor(private readonly configService: ConfigService) {
    const cfg: StorageConfig = {
      endpoint: this.configService.get<string>('MINIO_ENDPOINT', 'localhost'),
      port: Number(this.configService.get<string>('MINIO_PORT', '9000')),
      useSSL: this.configService.get<string>('MINIO_USE_SSL', 'false') === 'true',
      accessKey: this.configService.get<string>('MINIO_ACCESS_KEY', ''),
      secretKey: this.configService.get<string>('MINIO_SECRET_KEY', ''),
    };

    this.panBucket = this.configService.get<string>('MINIO_PAN_BUCKET', PAN_CARDS_BUCKET);
    this.aadhaarBucket = this.configService.get<string>(
      'MINIO_AADHAAR_BUCKET',
      AADHAAR_CARDS_BUCKET,
    );
    this.livePhotosBucket = this.configService.get<string>(
      'MINIO_LIVE_PHOTO_BUCKET',
      LIVE_PHOTOS_BUCKET,
    );
    this.buckets = [this.panBucket, this.aadhaarBucket, this.livePhotosBucket];

    this.enableBucketEncryption =
      this.configService.get<string>('MINIO_ENABLE_SSE', 'false') === 'true';

    this.bucketEncryptionConfig = {
      Rule: [
        {
          ApplyServerSideEncryptionByDefault: {
            SSEAlgorithm: ENCRYPTION_ALGORITHM,
          },
        },
      ],
    };

    this.minio = new MinioClient({
      endPoint: cfg.endpoint,
      port: cfg.port,
      useSSL: cfg.useSSL,
      accessKey: cfg.accessKey,
      secretKey: cfg.secretKey,
    });
  }

  async onModuleInit(): Promise<void> {
    for (const bucket of this.buckets) {
      await this.ensureBucketExists(bucket);
      if (this.enableBucketEncryption) {
        await this.setBucketEncryption(bucket);
      }
    }
  }

  async uploadDocument(
    documentType: DocumentType,
    userId: string,
    file: UploadDocumentDto,
  ): Promise<string> {
    const bucket = this.getBucketForDocumentType(documentType);
    if (file.buffer.byteLength > MAX_FILE_SIZE) {
      throw new StorageUploadException('File size exceeds limit', bucket);
    }
    const metadata = file.metadata ?? {};
    const objectName = this.buildObjectName(userId, file.filename);
    try {
      await this.minio.putObject(
        bucket,
        objectName,
        file.buffer,
        file.buffer.byteLength,
        {
          'Content-Type': file.mimetype,
          'X-Amz-Meta-Original-Filename': file.filename,
          'X-Amz-Meta-Uploaded-At': new Date().toISOString(),
          ...metadata,
        },
      );
      return `${bucket}/${objectName}`;
    } catch (err: any) {
      throw new StorageUploadException(err?.message ?? 'Upload failed', bucket, objectName);
    }
  }

  async downloadDocument(bucket: string, objectName: string): Promise<DownloadDocumentResult> {
    try {
      const stream = await this.minio.getObject(bucket, objectName);
      // MinIO JS SDK does not expose metadata directly on getObject result; callers must know metadata.
      return { stream, metadata: {} };
    } catch (err: any) {
      throw new StorageDownloadException(err?.message ?? 'Download failed', bucket, objectName);
    }
  }

  async deleteDocument(bucket: string, objectName: string): Promise<boolean> {
    try {
      await this.minio.removeObject(bucket, objectName);
      return true;
    } catch (err: any) {
      throw new StorageDeleteException(err?.message ?? 'Delete failed', bucket, objectName);
    }
  }

  async generatePresignedUrl(
    bucket: string,
    objectName: string,
    expirySeconds: number = PRESIGNED_URL_EXPIRY,
  ): Promise<string> {
    try {
      return await this.minio.presignedGetObject(bucket, objectName, expirySeconds);
    } catch (err: any) {
      throw new StoragePresignedUrlException(err?.message ?? 'Presigned URL failed', bucket, objectName);
    }
  }

  private getBucketForDocumentType(documentType: DocumentType): string {
    switch (documentType) {
      case DocumentType.PAN_CARD:
        return this.panBucket;
      case DocumentType.AADHAAR_CARD:
        return this.aadhaarBucket;
      case DocumentType.LIVE_PHOTO:
        return this.livePhotosBucket;
      default:
        return this.panBucket;
    }
  }

  private buildObjectName(userId: string, filename: string): string {
    const sanitized = this.sanitizeFilename(filename);
    return `${userId}/${Date.now()}-${sanitized}`;
  }

  private sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  private async ensureBucketExists(bucket: string): Promise<void> {
    const exists = await this.minio.bucketExists(bucket);
    if (!exists) {
      await this.minio.makeBucket(bucket);
    }
  }

  private async setBucketEncryption(bucket: string): Promise<void> {
    try {
      await this.minio.setBucketEncryption(bucket, this.bucketEncryptionConfig as any);
    } catch (err: any) {
      // If KMS/SSE isn't configured on MinIO, skip silently in dev/default setups.
      if (err?.code === 'NotImplemented' || err?.message?.includes('KMS')) {
        return;
      }
      throw err;
    }
  }
}
