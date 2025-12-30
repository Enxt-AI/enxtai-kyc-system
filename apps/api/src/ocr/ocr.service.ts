import { HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Tesseract from 'tesseract.js';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import {
  AADHAAR_REGEX,
  DOB_PATTERNS,
  MAX_OCR_IMAGE_DIMENSION,
  MIN_CONFIDENCE_DEFAULT,
  PAN_REGEX,
  TESSERACT_CONFIG,
} from './constants/ocr.constants';
import { OcrErrorCode, OcrException } from './exceptions/ocr.exception';
import { AadhaarOcrResult, PanOcrResult } from './interfaces/ocr-result.interface';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly minConfidence: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly configService: ConfigService,
  ) {
    this.minConfidence = Number(
      this.configService.get<string>('OCR_MIN_CONFIDENCE', String(MIN_CONFIDENCE_DEFAULT)),
    );
  }

  /**
   * Preprocesses an image buffer to improve OCR results by normalizing, grayscaling, and resizing.
   * @param buffer Raw image buffer from storage.
   * @returns Processed image buffer ready for OCR.
   */
  async preprocessImage(buffer: Buffer): Promise<Buffer> {
    const image = sharp(buffer).grayscale().normalize().sharpen();
    const metadata = await image.metadata();
    const width = metadata.width ?? 0;
    const height = metadata.height ?? 0;

    if (width > MAX_OCR_IMAGE_DIMENSION || height > MAX_OCR_IMAGE_DIMENSION) {
      const ratio = Math.min(
        MAX_OCR_IMAGE_DIMENSION / Math.max(width, 1),
        MAX_OCR_IMAGE_DIMENSION / Math.max(height, 1),
      );
      const targetWidth = Math.floor(width * ratio);
      const targetHeight = Math.floor(height * ratio);
      image.resize(targetWidth || MAX_OCR_IMAGE_DIMENSION, targetHeight || MAX_OCR_IMAGE_DIMENSION, {
        fit: 'inside',
      });
    }

    return image.toBuffer();
  }

  /**
   * Extracts PAN data from a submission's uploaded document and returns structured OCR output.
   * @param submissionId Unique submission identifier.
   * @returns PAN OCR result including number, optional name, date of birth, raw text, and confidence.
   * @throws NotFoundException when submission is missing.
   * @throws OcrException when documents are missing, validation fails, or OCR confidence is low.
   */
  async extractPanData(submissionId: string): Promise<PanOcrResult> {
    const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    if (!submission.panDocumentUrl) {
      throw new OcrException('PAN document not uploaded', OcrErrorCode.DATA_EXTRACTION_FAILED);
    }

    const { bucket, objectName } = this.parseObjectPath(submission.panDocumentUrl);
    this.ensureNotPdf(objectName, 'PAN');
    const { stream } = await this.storageService.downloadDocument(bucket, objectName);
    const buffer = await this.streamToBuffer(stream as unknown as NodeJS.ReadableStream);
    const processed = await this.preprocessImage(buffer);

    let ocrText = '';
    let confidence = 0;
    try {
      const result = await Tesseract.recognize(processed, TESSERACT_CONFIG.lang);
      ocrText = result?.data?.text ?? '';
      confidence = result?.data?.confidence ?? 0;
    } catch (err: any) {
      this.logger.error(`PAN OCR failed for submission ${submissionId}: ${err?.message}`);
      throw new OcrException('OCR processing failed', OcrErrorCode.OCR_FAILED, HttpStatus.BAD_GATEWAY);
    }

    this.ensureConfidence(confidence, submissionId, 'PAN');
    const lines = this.normalizeLines(ocrText);
    const panNumber = this.findFirstMatch(lines, PAN_REGEX);
    if (!panNumber) {
      throw new OcrException('PAN number not detected', OcrErrorCode.DATA_EXTRACTION_FAILED);
    }
    const fullName = this.deriveNameFromLines(lines);
    const dateOfBirth = this.extractDobFromLines(lines);

    return {
      panNumber,
      fullName,
      dateOfBirth,
      rawText: ocrText.trim(),
      confidence,
    };
  }

  /**
   * Extracts Aadhaar data from a submission's uploaded document and returns structured OCR output.
   * @param submissionId Unique submission identifier.
   * @returns Aadhaar OCR result including masked number, optional name, address, raw text, and confidence.
   * @throws NotFoundException when submission is missing.
   * @throws OcrException when documents are missing, validation fails, or OCR confidence is low.
   */
  async extractAadhaarData(submissionId: string): Promise<AadhaarOcrResult> {
    const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    if (!submission.aadhaarDocumentUrl) {
      throw new OcrException('Aadhaar document not uploaded', OcrErrorCode.DATA_EXTRACTION_FAILED);
    }

    const data = await this.extractFromAadhaarDocument(submission.aadhaarDocumentUrl, submissionId);

    if (!data.aadhaarNumber) {
      throw new OcrException('Aadhaar number not detected', OcrErrorCode.DATA_EXTRACTION_FAILED);
    }

    return data;
  }

  private async extractFromAadhaarDocument(
    documentUrl: string,
    submissionId: string,
  ): Promise<AadhaarOcrResult> {
    const { bucket, objectName } = this.parseObjectPath(documentUrl);
    this.ensureNotPdf(objectName, 'AADHAAR');
    const { stream } = await this.storageService.downloadDocument(bucket, objectName);
    const buffer = await this.streamToBuffer(stream as unknown as NodeJS.ReadableStream);
    const processed = await this.preprocessImage(buffer);

    let ocrText = '';
    let confidence = 0;
    try {
      const result = await Tesseract.recognize(processed, TESSERACT_CONFIG.lang);
      ocrText = result?.data?.text ?? '';
      confidence = result?.data?.confidence ?? 0;
    } catch (err: any) {
      this.logger.error(`Aadhaar OCR failed for submission ${submissionId}: ${err?.message}`);
      throw new OcrException('OCR processing failed', OcrErrorCode.OCR_FAILED, HttpStatus.BAD_GATEWAY);
    }

    this.ensureConfidence(confidence, submissionId, 'AADHAAR');
    const lines = this.normalizeLines(ocrText);

    const aadhaarMatch = this.findFirstMatch(lines, AADHAAR_REGEX);
    const aadhaarNumber = aadhaarMatch
      ? this.maskAadhaarNumber(aadhaarMatch.replace(/\s+/g, ''))
      : undefined;
    if (!aadhaarNumber) {
      throw new OcrException('Aadhaar number not detected', OcrErrorCode.DATA_EXTRACTION_FAILED);
    }
    const fullName = this.deriveNameFromLines(lines);
    const address = this.extractAddressFromLines(lines);

    return {
      aadhaarNumber,
      fullName,
      address,
      rawText: ocrText.trim(),
      confidence,
    };
  }

  /**
   * Masks an Aadhaar number, preserving only the last four digits.
   * @param aadhaar Unmasked 12-digit Aadhaar number.
   * @returns Masked Aadhaar string.
   */
  maskAadhaarNumber(aadhaar: string): string {
    const trimmed = aadhaar.replace(/\s+/g, '');
    const suffix = trimmed.slice(-4);
    return `********${suffix}`;
  }

  /**
   * Converts a readable stream to a buffer.
   * @param stream Readable stream from storage download.
   * @returns Combined buffer of stream contents.
   */
  async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      stream.on('error', (err) => reject(err));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  private parseObjectPath(path: string): { bucket: string; objectName: string } {
    const [bucket, ...rest] = path.split('/');
    const objectName = rest.join('/');
    if (!bucket || !objectName) {
      throw new OcrException('Invalid storage object path', OcrErrorCode.DATA_EXTRACTION_FAILED);
    }
    return { bucket, objectName };
  }

  private normalizeLines(text: string): string[] {
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  }

  private findFirstMatch(lines: string[], pattern: RegExp): string | undefined {
    for (const line of lines) {
      const match = line.match(pattern);
      if (match) {
        return match[0].toUpperCase();
      }
    }
    return undefined;
  }

  private deriveNameFromLines(lines: string[]): string | undefined {
    const blacklist = ['income', 'tax', 'department', 'authority', 'government', 'permanent', 'account', 'number', 'unique', 'identification'];
    return lines.find((line) => {
      const lower = line.toLowerCase();
      return (
        line.length > 3 &&
        !/\d/.test(line) &&
        !blacklist.some((token) => lower.includes(token))
      );
    });
  }

  private extractDobFromLines(lines: string[]): string | undefined {
    for (const line of lines) {
      for (const pattern of DOB_PATTERNS) {
        const match = line.match(pattern);
        if (match) {
          return match[0];
        }
      }
    }
    return undefined;
  }

  private extractAddressFromLines(lines: string[]): string | undefined {
    const addressIndex = lines.findIndex((line) => /address/i.test(line));
    const addressLines = addressIndex >= 0 ? lines.slice(addressIndex + 1) : lines.slice(-3);
    if (addressIndex >= 0 && addressLines.length === 0 && lines[addressIndex]) {
      addressLines.push(lines[addressIndex]);
    }
    const cleaned = addressLines.filter((line) => line.length > 3 && /[a-zA-Z]/.test(line));
    const address = cleaned.join(', ');
    return address || undefined;
  }

  private ensureNotPdf(objectName: string, docType: string) {
    if (objectName.toLowerCase().endsWith('.pdf')) {
      throw new OcrException(
        `${docType} PDF documents are not supported for OCR; please upload an image`,
        OcrErrorCode.VALIDATION_FAILED,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
      );
    }
  }

  private ensureConfidence(confidence: number, submissionId: string, docType: string) {
    if (confidence < this.minConfidence) {
      this.logger.warn(
        `Low OCR confidence (${confidence}) for ${docType} submission ${submissionId}; threshold ${this.minConfidence}`,
      );
      throw new OcrException(
        'Image quality too low for OCR',
        OcrErrorCode.POOR_IMAGE_QUALITY,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
  }
}
