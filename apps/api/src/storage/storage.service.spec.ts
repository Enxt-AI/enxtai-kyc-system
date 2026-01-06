import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Client as MinioClient } from 'minio';
import {
  PRESIGNED_URL_EXPIRY,
} from './storage.constants';
import { DocumentType } from './storage.types';
import { StorageService } from './storage.service';
import { StorageUploadException } from './exceptions/storage-upload.exception';

jest.mock('minio');

describe('StorageService', () => {
  let service: StorageService;
  let minioMock: jest.Mocked<MinioClient>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        StorageService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const map: Record<string, any> = {
                MINIO_ENDPOINT: 'localhost',
                MINIO_PORT: '9000',
                MINIO_USE_SSL: 'false',
                MINIO_ACCESS_KEY: 'access',
                MINIO_SECRET_KEY: 'secret',
                MINIO_ENABLE_SSE: 'true',
              };
              return map[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get(StorageService);
    minioMock = (service as any).minio as jest.Mocked<MinioClient>;
    // provide default mock implementations
    minioMock.bucketExists = jest.fn().mockResolvedValue(true) as any;
    minioMock.makeBucket = jest.fn().mockResolvedValue(undefined) as any;
    minioMock.setBucketEncryption = jest.fn().mockResolvedValue(undefined) as any;
    minioMock.putObject = jest.fn().mockResolvedValue(undefined) as any;
    minioMock.getObject = jest.fn().mockResolvedValue({} as any) as any;
    minioMock.removeObject = jest.fn().mockResolvedValue(undefined) as any;
    minioMock.presignedGetObject = jest.fn().mockResolvedValue('https://example.com') as any;
    minioMock.removeBucket = jest.fn().mockResolvedValue(undefined) as any;
    minioMock.removeObjects = jest.fn().mockResolvedValue(undefined) as any;
    minioMock.listObjectsV2 = jest.fn().mockReturnValue({
      on: jest.fn().mockImplementation(function(this: any, event: string, callback: Function) {
        if (event === 'end') {
          setTimeout(() => callback(), 0);
        }
        return this;
      }),
    }) as any;
  });

  it('should not create buckets on module init', async () => {
    await service.onModuleInit();
    expect(minioMock.makeBucket).not.toHaveBeenCalled();
    expect(minioMock.setBucketEncryption).not.toHaveBeenCalled();
  });

  it('should upload document successfully', async () => {
    const clientId = '00000000-0000-0000-0000-000000000000';
    const path = await service.uploadDocument(DocumentType.PAN_CARD, clientId, 'user1', {
      buffer: Buffer.from('data'),
      filename: 'file.jpg',
      mimetype: 'image/jpeg',
    });
    expect(path).toContain(`kyc-${clientId}-pan`);
    expect(minioMock.putObject).toHaveBeenCalled();
  });

  it('should reject oversize files', async () => {
    const clientId = '00000000-0000-0000-0000-000000000000';
    await expect(
      service.uploadDocument(DocumentType.PAN_CARD, clientId, 'user1', {
        buffer: Buffer.alloc(6 * 1024 * 1024),
        filename: 'big.jpg',
        mimetype: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(StorageUploadException);
  });

  it('should map document types to client-specific buckets', () => {
    const clientId = '00000000-0000-0000-0000-000000000000';
    expect((service as any).getBucketForDocumentType(DocumentType.PAN_CARD, clientId)).toBe(`kyc-${clientId}-pan`);
    expect((service as any).getBucketForDocumentType(DocumentType.AADHAAR_CARD, clientId)).toBe(`kyc-${clientId}-aadhaar-cards`);
    expect((service as any).getBucketForDocumentType(DocumentType.LIVE_PHOTO, clientId)).toBe(`kyc-${clientId}-live-photos`);
    expect((service as any).getBucketForDocumentType(DocumentType.SIGNATURE, clientId)).toBe(`kyc-${clientId}-signatures`);
  });

  it('should generate presigned url with default expiry', async () => {
    await service.generatePresignedUrl('bucket', 'obj');
    expect(minioMock.presignedGetObject).toHaveBeenCalledWith('bucket', 'obj', PRESIGNED_URL_EXPIRY);
  });

  it('should delete document', async () => {
    const ok = await service.deleteDocument('bucket', 'obj');
    expect(ok).toBe(true);
    expect(minioMock.removeObject).toHaveBeenCalled();
  });

  it('should download document', async () => {
    const res = await service.downloadDocument('bucket', 'obj');
    expect(res.stream).toBeDefined();
    expect(minioMock.getObject).toHaveBeenCalled();
  });

  it('should create all client buckets with encryption', async () => {
    minioMock.bucketExists = jest.fn().mockResolvedValue(false) as any;
    const clientId = 'test-client-123';

    await service.createClientBuckets(clientId);

    // Should create 4 buckets: pan, aadhaar-cards, live-photos, signatures
    expect(minioMock.bucketExists).toHaveBeenCalledTimes(4);
    expect(minioMock.makeBucket).toHaveBeenCalledTimes(4);
    expect(minioMock.makeBucket).toHaveBeenCalledWith(`kyc-${clientId}-pan`);
    expect(minioMock.makeBucket).toHaveBeenCalledWith(`kyc-${clientId}-aadhaar-cards`);
    expect(minioMock.makeBucket).toHaveBeenCalledWith(`kyc-${clientId}-live-photos`);
    expect(minioMock.makeBucket).toHaveBeenCalledWith(`kyc-${clientId}-signatures`);
    expect(minioMock.setBucketEncryption).toHaveBeenCalledTimes(4);
  });

  it('should skip creating buckets that already exist but still set encryption', async () => {
    minioMock.bucketExists = jest.fn().mockResolvedValue(true) as any;
    const clientId = 'existing-client';

    await service.createClientBuckets(clientId);

    expect(minioMock.bucketExists).toHaveBeenCalledTimes(4);
    expect(minioMock.makeBucket).not.toHaveBeenCalled();
    expect(minioMock.setBucketEncryption).toHaveBeenCalledTimes(4);
  });

  it('should delete all client buckets and their objects', async () => {
    const clientId = 'client-to-delete';
    minioMock.bucketExists = jest.fn().mockResolvedValue(true) as any;

    await service.deleteClientBuckets(clientId);

    // Should check existence for all 4 buckets
    expect(minioMock.bucketExists).toHaveBeenCalledTimes(4);
    expect(minioMock.bucketExists).toHaveBeenCalledWith(`kyc-${clientId}-pan`);
    expect(minioMock.bucketExists).toHaveBeenCalledWith(`kyc-${clientId}-aadhaar-cards`);
    expect(minioMock.bucketExists).toHaveBeenCalledWith(`kyc-${clientId}-live-photos`);
    expect(minioMock.bucketExists).toHaveBeenCalledWith(`kyc-${clientId}-signatures`);

    // Should list objects and remove buckets
    expect(minioMock.listObjectsV2).toHaveBeenCalledTimes(4);
    expect(minioMock.removeBucket).toHaveBeenCalledTimes(4);
  });

  it('should handle non-existent buckets gracefully during deletion', async () => {
    const clientId = 'non-existent-client';
    minioMock.bucketExists = jest.fn().mockResolvedValue(false) as any;

    await service.deleteClientBuckets(clientId);

    expect(minioMock.bucketExists).toHaveBeenCalledTimes(4);
    expect(minioMock.listObjectsV2).not.toHaveBeenCalled();
    expect(minioMock.removeBucket).not.toHaveBeenCalled();
  });
});
