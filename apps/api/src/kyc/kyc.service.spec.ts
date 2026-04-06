import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { KycService } from './kyc.service';
import { DocumentType } from '../storage/storage.types';
import { InternalStatus } from '@enxtai/shared-types';
import { FaceRecognitionService } from '../face-recognition/face-recognition.service';
import { WebhookService } from '../webhooks/webhook.service';
import { DigiLockerDocumentService } from '../digilocker/digilocker-document.service';

import { AadhaarOcrService } from '../aadhaar-ocr/aadhaar-ocr.service';
import { AadhaarQrService } from '../aadhaar-qr/aadhaar-qr.service';

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
  
  let faceRecognition: jest.Mocked<FaceRecognitionService>;
  let aadhaarOcr: jest.Mocked<AadhaarOcrService>;
  let aadhaarQr: jest.Mocked<AadhaarQrService>;

  const mockFile = (mimetype = 'image/jpeg', size = 1024 * 1024) => ({
    filename: 'test.jpg',
    mimetype,
    toBuffer: jest.fn().mockResolvedValue(Buffer.alloc(size)),
  }) as any;

  beforeEach(async () => {
    prisma = {
      clientUser: {
        findUnique: jest.fn().mockResolvedValue({ id: 'clientUser-1', clientId: '00000000-0000-0000-0000-000000000000' }),
      },
      kYCSubmission: {
        create: jest.fn().mockResolvedValue({ id: 'sub-1', userId: 'clientUser-1', internalStatus: InternalStatus.PENDING }),
        findFirst: jest.fn().mockResolvedValue({ id: 'sub-1', userId: 'clientUser-1', internalStatus: InternalStatus.PENDING }),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'sub-1', panNumber: 'dummy', aadhaarFrontUrl: 'path', livePhotoUrl: 'path' }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue({ id: 'audit-1' }),
      },
    } as any;

    storage = {
      uploadDocument: jest.fn().mockResolvedValue('bucket/path'),
    } as any;

    

    faceRecognition = {
      verifyFaceWorkflow: jest.fn(),
    } as any;

    aadhaarOcr = {
      triggerAadhaarExtraction: jest.fn().mockResolvedValue(undefined),
    } as any;

    aadhaarQr = {
      decodeQrString: jest.fn().mockResolvedValue({
        uid: 'XXXX XXXX 1234',
        fullName: 'Test User',
        gender: 'Male',
      }),
    } as any;

    let webhookService: any;
    let digilockerService: any;

    webhookService = {
      triggerWebhook: jest.fn(),
    };

    digilockerService = {
      fetchDocuments: jest.fn(),
    };

    const module = await Test.createTestingModule({
      providers: [
        KycService,
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: FaceRecognitionService, useValue: faceRecognition },
        { provide: WebhookService, useValue: webhookService },
        { provide: DigiLockerDocumentService, useValue: digilockerService },
        { provide: AadhaarOcrService, useValue: aadhaarOcr },
        { provide: AadhaarQrService, useValue: aadhaarQr },
      ],
    }).compile();

    service = module.get(KycService);
    metadataMock.mockResolvedValue({ width: 1200, height: 800 });
  });



  it('uploads Aadhaar document and updates submission', async () => {
    const file = mockFile('image/png', 500000);
    const res = await service.uploadAadhaarFront('clientUser-1', file);
    expect(storage.uploadDocument).toHaveBeenCalledWith(DocumentType.AADHAAR_CARD_FRONT, '00000000-0000-0000-0000-000000000000', 'clientUser-1', expect.any(Object));
    expect(prisma.kYCSubmission.update).toHaveBeenCalled();
    expect(res.aadhaarFrontUrl).toBeDefined();
  });

  it('uploads live photo with image-only validation and updates status when docs exist', async () => {
    prisma.kYCSubmission.findFirst = jest
      .fn()
      .mockResolvedValue({
        id: 'sub-1',
        userId: 'clientUser-1',
        panNumber: 'dummy',
        aadhaarFrontUrl: 'aadhaar-front',
        aadhaarBackUrl: 'aadhaar-back',
        signatureUrl: 'signature-path',
        internalStatus: InternalStatus.PENDING,
      } as any);

    const file = mockFile('image/jpeg', 500000);
    const res = await service.uploadLivePhotoDocument('clientUser-1', file);
    expect(storage.uploadDocument).toHaveBeenCalledWith(
      DocumentType.LIVE_PHOTO,
      '00000000-0000-0000-0000-000000000000',
      'clientUser-1',
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
    await expect(service.uploadLivePhotoDocument('clientUser-1', file)).rejects.toBeInstanceOf(BadRequestException);
  });
});
