import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Readable } from 'stream';
import Tesseract from 'tesseract.js';
import { OcrService } from './ocr.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { OcrException, OcrErrorCode } from './exceptions/ocr.exception';

jest.mock('tesseract.js', () => ({
  recognize: jest.fn(),
}));

jest.mock('sharp', () => {
  const chain = {
    grayscale: jest.fn().mockReturnThis(),
    normalize: jest.fn().mockReturnThis(),
    sharpen: jest.fn().mockReturnThis(),
    resize: jest.fn().mockReturnThis(),
    metadata: jest.fn().mockResolvedValue({ width: 1000, height: 800 }),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed')),
  };
  return jest.fn(() => chain);
});

describe('OcrService', () => {
  let service: OcrService;
  let prisma: { kYCSubmission: { findUnique: jest.Mock } };
  let storage: jest.Mocked<StorageService>;
  let config: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        OcrService,
        {
          provide: PrismaService,
          useValue: {
            kYCSubmission: {
              findUnique: jest.fn(),
            },
          },
        },
        {
          provide: StorageService,
          useValue: {
            downloadDocument: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('60'),
          },
        },
      ],
    }).compile();

    service = module.get(OcrService);
    prisma = module.get(PrismaService) as any;
    storage = module.get(StorageService) as jest.Mocked<StorageService>;
    config = module.get(ConfigService) as jest.Mocked<ConfigService>;
    storage.downloadDocument.mockImplementation(async () => ({ stream: Readable.from(['file']) } as any));
  });

  describe('preprocessImage', () => {
    it('should normalize and return processed buffer', async () => {
      const buffer = Buffer.from('input');
      const processed = await service.preprocessImage(buffer);
      expect(processed.toString()).toBe('processed');
    });
  });

  describe('extractPanData', () => {
    it('should extract pan data and return structured result', async () => {
      prisma.kYCSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        panDocumentUrl: 'pan-cards/user/file.jpg',
      } as any);
      storage.downloadDocument.mockImplementation(async () => ({ stream: Readable.from(['file']) } as any));
      (Tesseract.recognize as jest.Mock).mockResolvedValue({
        data: {
          text: 'ABCDE1234F\nJOHN DOE\n01/01/1990',
          confidence: 92,
        },
      });

      const result = await service.extractPanData('sub-1');
      expect(result.panNumber).toBe('ABCDE1234F');
      expect(result.fullName).toBe('JOHN DOE');
      expect(result.dateOfBirth).toBe('01/01/1990');
    });

    it('should extract pan when label is present', async () => {
      prisma.kYCSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        panDocumentUrl: 'pan-cards/user/file.jpg',
      } as any);
      storage.downloadDocument.mockImplementation(async () => ({ stream: Readable.from(['file']) } as any));
      (Tesseract.recognize as jest.Mock).mockResolvedValue({
        data: {
          text: 'PAN: ABCDE1234F\nJane Doe',
          confidence: 90,
        },
      });

      const result = await service.extractPanData('sub-1');
      expect(result.panNumber).toBe('ABCDE1234F');
      expect(result.fullName).toBe('Jane Doe');
    });

    it('should throw when confidence is low', async () => {
      prisma.kYCSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        panDocumentUrl: 'pan-cards/user/file.jpg',
      } as any);
      storage.downloadDocument.mockResolvedValue({ stream: Readable.from(['file']) } as any);
      (Tesseract.recognize as jest.Mock).mockResolvedValue({
        data: { text: 'ABCDE1234F', confidence: 10 },
      });

      await expect(service.extractPanData('sub-1')).rejects.toBeInstanceOf(OcrException);
    });

    it('should throw when submission missing', async () => {
      prisma.kYCSubmission.findUnique.mockResolvedValue(null as any);
      await expect(service.extractPanData('missing')).rejects.toBeInstanceOf(Error);
    });

    it('should throw for pdf pan document', async () => {
      prisma.kYCSubmission.findUnique.mockResolvedValue({
        id: 'sub-1',
        panDocumentUrl: 'pan-cards/user/file.pdf',
      } as any);

      await expect(service.extractPanData('sub-1')).rejects.toBeInstanceOf(OcrException);
    });
  });

  describe('extractAadhaarData', () => {
    it('should extract aadhaar data with masking', async () => {
      prisma.kYCSubmission.findUnique.mockResolvedValue({
        id: 'sub-2',
        aadhaarDocumentUrl: 'aadhaar-cards/user/front.jpg',
      } as any);
        (service as any).extractFromAadhaarDocument = jest.fn().mockResolvedValue({
          aadhaarNumber: '********9012',
          fullName: 'JANE DOE',
          address: 'Address Line One, Address Line Two',
          rawText: 'front text',
          confidence: 85,
        });

      const result = await service.extractAadhaarData('sub-2');
      expect(result.aadhaarNumber).toBe('********9012');
      expect(result.fullName).toBe('JANE DOE');
      expect(result.address).toContain('Address');
    }, 10000);

    it('should throw when aadhaar not found', async () => {
      prisma.kYCSubmission.findUnique.mockResolvedValue({
        id: 'sub-2',
        aadhaarDocumentUrl: 'aadhaar-cards/user/file.jpg',
      } as any);
        (service as any).extractFromAadhaarDocument = jest.fn().mockResolvedValue({
          rawText: 'no data',
          confidence: 90,
        });

      await expect(service.extractAadhaarData('sub-2')).rejects.toBeInstanceOf(OcrException);
    });
  });

  describe('maskAadhaarNumber', () => {
    it('should mask and preserve last 4 digits', () => {
      expect(service.maskAadhaarNumber('1234 5678 9012')).toBe('********9012');
    });
  });
});
