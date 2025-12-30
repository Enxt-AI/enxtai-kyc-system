import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Client as MinioClient } from 'minio';
import {
  AADHAAR_CARDS_BUCKET,
  LIVE_PHOTOS_BUCKET,
  PAN_CARDS_BUCKET,
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
  });

  it('should initialize buckets and encryption on module init', async () => {
    minioMock.bucketExists = jest.fn().mockResolvedValue(false) as any;
    await service.onModuleInit();
    expect(minioMock.makeBucket).toHaveBeenCalledTimes(3);
    expect(minioMock.setBucketEncryption).toHaveBeenCalledTimes(3);
  });

  it('should upload document successfully', async () => {
    const path = await service.uploadDocument(DocumentType.PAN_CARD, 'user1', {
      buffer: Buffer.from('data'),
      filename: 'file.jpg',
      mimetype: 'image/jpeg',
    });
    expect(path).toContain(PAN_CARDS_BUCKET);
    expect(minioMock.putObject).toHaveBeenCalled();
  });

  it('should reject oversize files', async () => {
    await expect(
      service.uploadDocument(DocumentType.PAN_CARD, 'user1', {
        buffer: Buffer.alloc(6 * 1024 * 1024),
        filename: 'big.jpg',
        mimetype: 'image/jpeg',
      }),
    ).rejects.toBeInstanceOf(StorageUploadException);
  });

  it('should map document types to buckets', () => {
    expect((service as any).getBucketForDocumentType(DocumentType.PAN_CARD)).toBe(PAN_CARDS_BUCKET);
    expect((service as any).getBucketForDocumentType(DocumentType.AADHAAR_CARD)).toBe(AADHAAR_CARDS_BUCKET);
    expect((service as any).getBucketForDocumentType(DocumentType.LIVE_PHOTO)).toBe(LIVE_PHOTOS_BUCKET);
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
});
