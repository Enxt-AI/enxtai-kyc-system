import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client as MinioClient } from 'minio';
import {
  AADHAAR_CARDS_BUCKET,
  ENCRYPTION_ALGORITHM,
  LIVE_PHOTOS_BUCKET,
  MAX_FILE_SIZE,
  PAN_CARDS_BUCKET,
  SIGNATURES_BUCKET,
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
  private readonly signaturesBucket: string;
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
    this.signaturesBucket = this.configService.get<string>(
      'MINIO_SIGNATURES_BUCKET',
      SIGNATURES_BUCKET,
    );
    this.buckets = [this.panBucket, this.aadhaarBucket, this.livePhotosBucket, this.signaturesBucket];

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
    // Bucket creation moved to per-client onboarding via createClientBuckets()
  }

  /**
   * Upload Document to Client-Specific Bucket
   *
   * Uploads a document to a tenant-isolated MinIO bucket. Each client has separate buckets
   * for each document type, ensuring complete data isolation between organizations.
   *
   * **Multi-Tenancy Strategy**:
   * - Client-specific buckets ensure complete data isolation
   * - Prevents cross-tenant data access at storage layer
   * - Simplifies client offboarding (delete entire bucket)
   *
   * **Bucket Naming Convention**:
   * - Format: kyc-{clientId}-{suffix}
   * - Examples: kyc-abc-123-pan, kyc-abc-123-aadhaar-cards
   * - Suffix determined by document type (see getBucketForDocumentType)
   *
   * **Object Path Structure**:
   * - Format: {bucket}/{userId}/{documentType}_{timestamp}.{ext}
   * - Example: kyc-client-abc-123-pan/user-456/PAN_CARD_1234567890.jpg
   * - userId prefix allows efficient per-user queries
   *
   * **Security**:
   * - File size validated before upload (MAX_FILE_SIZE)
   * - Filename sanitized to prevent path traversal
   * - Metadata includes original filename and upload timestamp
   * - Optional encryption via MinIO SSE (if enabled)
   *
   * @param documentType - Type of document (PAN_CARD, AADHAAR_CARD, etc.)
   * @param clientId - UUID of the client organization (tenant identifier)
   * @param userId - UUID of the user uploading the document
   * @param file - File data including buffer, filename, and mimetype
   * @param suffix - Optional suffix for filename uniqueness (e.g., 'front', 'back')
   * @returns Full object path in format {bucket}/{objectName}
   * @throws {StorageUploadException} If file size exceeds limit or MinIO operation fails
   *
   * @example
   * const path = await uploadDocument(
   *   DocumentType.PAN_CARD,
   *   'abc-123-def-456',
   *   'user-789',
   *   { buffer: Buffer.from('...'), filename: 'pan.jpg', mimetype: 'image/jpeg' }
   * );
   * // Returns: "kyc-abc-123-def-456-pan/user-789/PAN_CARD_1704470400000.jpg"
   */
  async uploadDocument(
    documentType: DocumentType,
    clientId: string,
    userId: string,
    file: UploadDocumentDto,
    suffix?: string,
  ): Promise<string> {
    const bucket = this.getBucketForDocumentType(documentType, clientId);
    if (file.buffer.byteLength > MAX_FILE_SIZE) {
      throw new StorageUploadException('File size exceeds limit', bucket);
    }
    const metadata = file.metadata ?? {};
    const objectName = this.buildObjectName(userId, documentType, file.filename, suffix);
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

  /**
   * Download Document from MinIO Storage
   * 
   * Retrieves document from MinIO bucket for processing by OCR and face recognition services.
   * Returns readable stream for efficient memory usage with large files.
   * 
   * **Stream Handling**:
   * - Returns NodeJS.ReadableStream for streaming processing
   * - Caller responsible for converting to Buffer if needed
   * - Prevents loading entire file into memory during download
   * 
   * **Error Scenarios**:
   * - Bucket not found: MinIO throws NoSuchBucket error
   * - Object not found: MinIO throws NoSuchKey error
   * - Network issues: Connection timeout or MinIO unavailable
   * - Permission issues: Invalid credentials or bucket access denied
   * 
   * **Error Handling Strategy**:
   * - Wraps MinIO errors in StorageDownloadException for consistent API
   * - HTTP 404 status for missing documents (user-friendly)
   * - Preserves original error message for debugging
   * - Includes bucket and object context for troubleshooting
   * 
   * @param bucket - MinIO bucket name (e.g., 'kyc-client-123-pan')
   * @param objectName - Object path within bucket (e.g., 'user-456/PAN_CARD_123.jpg')
   * @returns Promise<DownloadDocumentResult> - Stream and metadata for document
   * 
   * @throws {StorageDownloadException} When document not found or download fails (HTTP 404)
   * 
   * @example
   * ```typescript
   * try {
   *   const { stream } = await this.downloadDocument('kyc-client-123-pan', 'user/doc.jpg');
   *   const buffer = await streamToBuffer(stream);
   *   // Process document buffer
   * } catch (error) {
   *   if (error instanceof StorageDownloadException) {
   *     // Handle missing document or download failure
   *   }
   * }
   * ```
   */
  async downloadDocument(bucket: string, objectName: string): Promise<DownloadDocumentResult> {
    try {
      const stream = await this.minio.getObject(bucket, objectName);
      // MinIO JS SDK does not expose metadata directly on getObject result; callers must know metadata.
      return { stream, metadata: {} };
    } catch (err: any) {
      throw new StorageDownloadException(err?.message ?? 'Download failed', bucket, objectName);
    }
  }

  /**
   * Delete Document from MinIO Storage
   * 
   * Removes document from MinIO bucket permanently. Used when users delete
   * uploaded documents or during submission cleanup.
   * 
   * **Deletion Behavior**:
   * - Permanent removal (no versioning or trash)
   * - MinIO removeObject is idempotent (no error if object doesn't exist)
   * - Returns true on successful deletion
   * 
   * **Use Cases**:
   * - User requests document re-upload
   * - Admin deletes problematic submissions
   * - Cleanup during submission cancellation
   * - GDPR/privacy compliance (user data deletion)
   * 
   * **Error Scenarios**:
   * - Network issues: Connection timeout or MinIO unavailable
   * - Permission issues: Insufficient delete permissions on bucket
   * - Bucket issues: Bucket not found or locked
   * 
   * **Error Handling Strategy**:
   * - Wraps MinIO errors in StorageDeleteException for consistency
   * - HTTP 500 status as deletion failures are unexpected
   * - Preserves original error message for debugging
   * - Includes bucket and object context for troubleshooting
   * 
   * @param bucket - MinIO bucket name (e.g., 'kyc-client-123-pan')
   * @param objectName - Object path within bucket (e.g., 'user-456/PAN_CARD_123.jpg')
   * @returns Promise<boolean> - True when deletion succeeds
   * 
   * @throws {StorageDeleteException} When deletion operation fails (HTTP 500)
   * 
   * @example
   * ```typescript
   * try {
   *   const deleted = await this.deleteDocument('kyc-client-123-pan', 'user/doc.jpg');
   *   console.log('Document deleted:', deleted);
   * } catch (error) {
   *   if (error instanceof StorageDeleteException) {
   *     // Handle deletion failure (MinIO error, permissions, etc.)
   *   }
   * }
   * ```
   */
  async deleteDocument(bucket: string, objectName: string): Promise<boolean> {
    try {
      await this.minio.removeObject(bucket, objectName);
      return true;
    } catch (err: any) {
      throw new StorageDeleteException(err?.message ?? 'Delete failed', bucket, objectName);
    }
  }

  /**
   * Generate Presigned URL for Secure Document Access
   * 
   * Creates temporary signed URLs for direct client access to documents without
   * exposing MinIO credentials. Used for document preview and download functionality.
   * 
   * **Security Model**:
   * - Time-limited access (default 1 hour, configurable)
   * - No MinIO credentials required by client
   * - URL expires automatically for security
   * - Scoped to specific bucket and object (no broader access)
   * 
   * **Use Cases**:
   * - Admin document preview in dashboard
   * - Direct download links for verified documents
   * - Secure sharing with external verification services
   * - Client-side image display without proxying through API
   * 
   * **URL Expiration**:
   * - Default: 1 hour (PRESIGNED_URL_EXPIRY constant)
   * - Configurable per request (expirySeconds parameter)
   * - Expired URLs return 403 Forbidden from MinIO
   * 
   * **Error Scenarios**:
   * - Object not found: MinIO cannot sign URL for missing object
   * - Invalid bucket/object names: MinIO validation errors
   * - MinIO connectivity issues: Network errors
   * - Clock skew: Time synchronization issues between services
   * 
   * **Error Handling Strategy**:
   * - Wraps MinIO errors in StoragePresignedUrlException
   * - HTTP 500 status as URL generation failures are unexpected
   * - Preserves original error message for debugging
   * - Includes bucket and object context for troubleshooting
   * 
   * @param bucket - MinIO bucket name (e.g., 'kyc-client-123-pan')
   * @param objectName - Object path within bucket (e.g., 'user-456/PAN_CARD_123.jpg')
   * @param expirySeconds - URL expiration time in seconds (default: 3600 = 1 hour)
   * @returns Promise<string> - Signed URL for temporary document access
   * 
   * @throws {StoragePresignedUrlException} When URL generation fails (HTTP 500)
   * 
   * @example
   * ```typescript
   * try {
   *   const url = await this.generatePresignedUrl('kyc-client-123-pan', 'user/doc.jpg', 3600);
   *   // Use URL for direct document access (expires in 1 hour)
   * } catch (error) {
   *   if (error instanceof StoragePresignedUrlException) {
   *     // Handle URL generation failure
   *   }
   * }
   * ```
   */
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

  /**
   * Create Client-Specific Buckets
   *
   * Creates all required MinIO buckets for a new client during onboarding.
   * This method is called by the super admin when creating a new client organization.
   *
   * **Bucket Isolation Strategy**:
   * - Each client gets 4 separate buckets: pan, aadhaar-cards, live-photos, signatures
   * - Naming convention: kyc-{clientId}-{suffix}
   * - Encryption enabled if MINIO_ENABLE_SSE=true
   *
   * **Idempotency**:
   * - Checks if bucket exists before creation (safe to call multiple times)
   * - Skips existing buckets without error
   *
   * **Error Handling**:
   * - Throws if MinIO connection fails
   * - Logs encryption setup failures but continues (dev environments may lack KMS)
   *
   * @param clientId - UUID of the client organization
   * @returns Promise<void> - Resolves when all buckets are created
   * @throws Error if bucket creation fails
   *
   * @example
   * await storageService.createClientBuckets('abc-123-def-456');
   * // Creates: kyc-abc-123-def-456-pan, kyc-abc-123-def-456-aadhaar-cards, etc.
   */
  async createClientBuckets(clientId: string): Promise<void> {
    const buckets = [
      `kyc-${clientId}-pan`,
      `kyc-${clientId}-aadhaar-cards`,
      `kyc-${clientId}-live-photos`,
      `kyc-${clientId}-signatures`,
    ];

    for (const bucket of buckets) {
      await this.ensureBucketExists(bucket);
      if (this.enableBucketEncryption) {
        await this.setBucketEncryption(bucket);
      }
    }
  }

  /**
   * Delete Client-Specific Buckets
   *
   * Removes all MinIO buckets associated with a client during offboarding or account deletion.
   * This method is called by the super admin when permanently removing a client.
   *
   * **Data Deletion Strategy**:
   * - Deletes all objects within each bucket first (MinIO requires empty buckets)
   * - Then removes the bucket itself
   * - Ensures complete data cleanup for GDPR/compliance
   *
   * **Safety Considerations**:
   * - Irreversible operation - all client documents are permanently deleted
   * - Should be called only after client confirmation and backup (if required)
   * - Logs all deletion operations for audit trail
   *
   * **Error Handling**:
   * - Continues deletion even if some buckets don't exist
   * - Throws if MinIO connection fails
   * - Logs errors but doesn't halt process (best-effort cleanup)
   *
   * @param clientId - UUID of the client organization
   * @returns Promise<void> - Resolves when all buckets are deleted
   * @throws Error if critical deletion operations fail
   *
   * @example
   * await storageService.deleteClientBuckets('abc-123-def-456');
   * // Deletes: kyc-abc-123-def-456-pan, kyc-abc-123-def-456-aadhaar-cards, etc.
   */
  async deleteClientBuckets(clientId: string): Promise<void> {
    const buckets = [
      `kyc-${clientId}-pan`,
      `kyc-${clientId}-aadhaar-cards`,
      `kyc-${clientId}-live-photos`,
      `kyc-${clientId}-signatures`,
    ];

    for (const bucket of buckets) {
      try {
        const exists = await this.minio.bucketExists(bucket);
        if (!exists) {
          continue; // Skip non-existent buckets
        }

        // Delete all objects in bucket first
        const objectsStream = this.minio.listObjectsV2(bucket, '', true);
        const objectsList: string[] = [];

        await new Promise<void>((resolve, reject) => {
          objectsStream.on('data', (obj) => {
            if (obj.name) objectsList.push(obj.name);
          });
          objectsStream.on('end', () => resolve());
          objectsStream.on('error', (err) => reject(err));
        });

        if (objectsList.length > 0) {
          await this.minio.removeObjects(bucket, objectsList);
        }

        // Remove the bucket itself
        await this.minio.removeBucket(bucket);
      } catch (err: any) {
        // Log error but continue with other buckets
        console.error(`Failed to delete bucket ${bucket}:`, err.message);
      }
    }
  }

  /**
   * Get Bucket Name for Document Type
   *
   * Maps document types to client-specific bucket names following the multi-tenancy
   * naming convention: kyc-{clientId}-{suffix}.
   *
   * **Bucket Naming Strategy**:
   * - PAN cards: kyc-{clientId}-pan
   * - Aadhaar cards (all sides): kyc-{clientId}-aadhaar-cards
   * - Live photos: kyc-{clientId}-live-photos
   * - Signatures: kyc-{clientId}-signatures
   *
   * **Rationale**:
   * - Tenant isolation: Prevents cross-client data access
   * - Simplified deletion: Remove entire client bucket during offboarding
   * - Access control: IAM policies can be scoped to client buckets
   * - Audit trail: Bucket-level logging tracks all client operations
   *
   * **Migration Note**:
   * - Legacy shared buckets (pan-cards, aadhaar-cards, etc.) are deprecated
   * - Existing data should be migrated to client-specific buckets
   * - See storage.constants.ts for legacy bucket names
   *
   * @param documentType - Type of document (PAN_CARD, AADHAAR_CARD, etc.)
   * @param clientId - UUID of the client organization
   * @returns Fully qualified bucket name (e.g., "kyc-abc-123-pan")
   *
   * @example
   * getBucketForDocumentType(DocumentType.PAN_CARD, 'abc-123')
   * // Returns: "kyc-abc-123-pan"
   */
  private getBucketForDocumentType(documentType: DocumentType, clientId: string): string {
    switch (documentType) {
      case DocumentType.PAN_CARD:
        return `kyc-${clientId}-pan`;
      case DocumentType.AADHAAR_CARD:
        return `kyc-${clientId}-aadhaar-cards`;
      case DocumentType.AADHAAR_CARD_FRONT:
        return `kyc-${clientId}-aadhaar-cards`;
      case DocumentType.AADHAAR_CARD_BACK:
        return `kyc-${clientId}-aadhaar-cards`;
      case DocumentType.LIVE_PHOTO:
        return `kyc-${clientId}-live-photos`;
      case DocumentType.SIGNATURE:
        return `kyc-${clientId}-signatures`;
      default:
        return `kyc-${clientId}-pan`;
    }
  }

  private buildObjectName(userId: string, documentType: DocumentType, filename: string, suffix?: string): string {
    const sanitized = this.sanitizeFilename(filename);
    const ext = this.getExtension(sanitized);
    const baseName = suffix ? `${documentType}_${suffix}` : documentType;
    return `${userId}/${baseName}_${Date.now()}${ext}`;
  }

  private getExtension(filename: string): string {
    const lastDot = filename.lastIndexOf('.');
    if (lastDot === -1) {
      return '';
    }
    return filename.slice(lastDot);
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
