import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { KycService } from './kyc.service';
import { DocumentType } from '../storage/storage.types';
import { InternalStatus } from '@enxtai/shared-types';
import { OcrService } from '../ocr/ocr.service';
import { FaceRecognitionService } from '../face-recognition/face-recognition.service';

jest.mock('../face-recognition/face-recognition.service', () => {
  const verifyFaceWorkflow = jest.fn();
  return {
    FaceRecognitionService: jest.fn().mockImplementation(() => ({ verifyFaceWorkflow })),
  };
});

const metadataMock = jest.fn().mockResolvedValue({ width: 1200, height: 800 });
jest.mock('sharp', () => {
  return jest.fn(() => ({ metadata: metadataMock }));
});

describe('KycService', () => {
  let service: KycService;
  let prisma: jest.Mocked<PrismaService>;
  let storage: jest.Mocked<StorageService>;
  let ocr: jest.Mocked<OcrService>;
  let faceRecognition: jest.Mocked<FaceRecognitionService>;

  const mockFile = (mimetype = 'image/jpeg', size = 1024 * 1024) => ({
    filename: 'test.jpg',
    mimetype,
    toBuffer: jest.fn().mockResolvedValue(Buffer.alloc(size)),
  }) as any;

  beforeEach(async () => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ id: 'user-1' }),
      },
      kYCSubmission: {
        create: jest.fn().mockResolvedValue({ id: 'sub-1', userId: 'user-1', internalStatus: InternalStatus.PENDING }),
        findFirst: jest.fn().mockResolvedValue({ id: 'sub-1', userId: 'user-1', internalStatus: InternalStatus.PENDING }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'sub-1', panDocumentUrl: 'path', aadhaarDocumentUrl: 'path', livePhotoUrl: 'path' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as any;

    storage = {
      uploadDocument: jest.fn().mockResolvedValue('bucket/path'),
    } as any;

    ocr = {
      extractPanData: jest.fn(),
      extractAadhaarData: jest.fn(),
    } as any;

    faceRecognition = {
      verifyFaceWorkflow: jest.fn(),
    } as any;

    const module = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: OcrService, useValue: ocr },
        { provide: FaceRecognitionService, useValue: faceRecognition },
      ],
    }).compile();

    service = module.get(KycService);
    metadataMock.mockResolvedValue({ width: 1200, height: 800 });
  });

  it('uploads PAN document with validations', async () => {
    const file = mockFile('image/jpeg', 1024 * 1024);
    const res = await service.uploadPanDocument('user-1', file);
    expect(storage.uploadDocument).toHaveBeenCalledWith(DocumentType.PAN_CARD, 'user-1', expect.any(Object));
    expect(prisma.kYCSubmission.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: {
        panDocumentUrl: 'bucket/path',
        internalStatus: InternalStatus.DOCUMENTS_UPLOADED,
      },
    });
    expect(res.panDocumentUrl).toBeDefined();
  });

  it('rejects invalid file type', async () => {
    const file = mockFile('text/plain', 1024);
    await expect(service.uploadPanDocument('user-1', file)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects oversized file', async () => {
    const file = mockFile('image/jpeg', 6 * 1024 * 1024);
    await expect(service.uploadPanDocument('user-1', file)).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('rejects invalid dimensions', async () => {
    metadataMock.mockResolvedValueOnce({ width: 100, height: 100 });
    const file = mockFile('image/jpeg', 1024);
    await expect(service.uploadPanDocument('user-1', file)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uploads Aadhaar document and updates submission', async () => {
    const file = mockFile('image/png', 500000);
    const res = await service.uploadAadhaarDocument('user-1', file);
    expect(storage.uploadDocument).toHaveBeenCalledWith(DocumentType.AADHAAR_CARD, 'user-1', expect.any(Object));
    expect(prisma.kYCSubmission.update).toHaveBeenCalled();
    expect(res.aadhaarDocumentUrl).toBeDefined();
  });

  it('uploads live photo with image-only validation and updates status when docs exist', async () => {
    prisma.kYCSubmission.findFirst = jest
      .fn()
      .mockResolvedValue({
        id: 'sub-1',
        userId: 'user-1',
        panDocumentUrl: 'pan-path',
        aadhaarDocumentUrl: 'aadhaar-path',
        internalStatus: InternalStatus.PENDING,
      } as any);

    const file = mockFile('image/jpeg', 500000);
    const res = await service.uploadLivePhotoDocument('user-1', file);
    expect(storage.uploadDocument).toHaveBeenCalledWith(
      DocumentType.LIVE_PHOTO,
      'user-1',
      expect.any(Object),
    );
    expect(prisma.kYCSubmission.update).toHaveBeenCalledWith({
      where: { id: 'sub-1' },
      data: {
        livePhotoUrl: 'bucket/path',
        internalStatus: InternalStatus.DOCUMENTS_UPLOADED,
      },
    });
    expect(res.livePhotoUrl).toBeDefined();
  });

  it('rejects live photo with non-image type', async () => {
    const file = mockFile('application/pdf', 1024);
    await expect(service.uploadLivePhotoDocument('user-1', file)).rejects.toBeInstanceOf(BadRequestException);
  });
});
