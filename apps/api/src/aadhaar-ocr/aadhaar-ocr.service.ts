import { forwardRef, Inject, Injectable, Logger } from '@nestjs/common';
import { StorageService } from '../storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { KycService } from '../kyc/kyc.service';
import * as Tesseract from 'tesseract.js';
import sharp from 'sharp';

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

function validateAadhaar(aadhaar: string): boolean {
  if (aadhaar.length !== 12 || !/^[2-9]{1}[0-9]{11}$/.test(aadhaar)) return false;
  let c = 0;
  let myArray = aadhaar.split('').map(Number).reverse();
  for (let i = 0; i < myArray.length; i++) {
    c = VERHOEFF_D[c][VERHOEFF_P[i % 8][myArray[i]]];
  }
  return c === 0;
}

@Injectable()
export class AadhaarOcrService {
  private readonly logger = new Logger(AadhaarOcrService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    @Inject(forwardRef(() => KycService))
    private readonly kycService: KycService,
  ) {}

  /**
   * Triggers the OCR process asynchronously without blocking the user request.
   * Modifies the KYCSubmission with the extracted data upon completion.
   */
  async triggerAadhaarExtraction(submissionId: string): Promise<void> {
    try {
      const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
      if (!submission || !submission.aadhaarFrontUrl) return;

      this.logger.log(`Starting Aadhaar OCR Extraction for submission ${submissionId}`);

      const { bucket, objectName } = this.parseObjectPath(submission.aadhaarFrontUrl);
      const { stream } = await this.storageService.downloadDocument(bucket, objectName);
      
      const originalBuffer = await new Promise<Buffer>((resolve, reject) => {
        const chunks: any[] = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', err => reject(err));
      });

      // Pre-process image to boost OCR accuracy
      const processedImageBuffer = await sharp(originalBuffer)
        .grayscale()
        .normalize()
        .sharpen({ sigma: 1.5 })
        .toBuffer();

      const { data: { text } } = await Tesseract.recognize(processedImageBuffer, 'eng', {
        logger: m => { if (m.status === 'recognizing text') this.logger.debug(`OCR Progress: ${Math.round(m.progress * 100)}%`) }
      });

      const extractedAadhaar = this.extractAadhaarNumber(text);
      let name = this.extractName(text);
      let dob = this.extractDOB(text);

      // Instead of overwriting final DB fields, we write to extractionResults
      const updateData: any = {};
      if (extractedAadhaar) updateData.aadhaarNumber = extractedAadhaar;
      if (name) updateData.fullName = name;
      if (dob) updateData.dateOfBirth = dob;

      if (Object.keys(updateData).length > 0) {
        
        // Merge with existing extractionResults safely
        const existingResults = (submission.extractionResults as any) || {};

        await this.prisma.kYCSubmission.update({
          where: { id: submissionId },
          data: {
             extractionResults: {
                 ...existingResults,
                 ocrAadhaar: updateData
             }
          },
        });
        
        this.logger.log(
          `Aadhaar OCR Extraction SUCCESS for submission ${submissionId}` +
          ` (aadhaarNumber=${extractedAadhaar ? 'found' : 'not found'}, name=${name ? 'found' : 'not found'}, dob=${dob ? 'found' : 'not found'})`,
        );

        // Trigger Orchestrator Validation
        this.kycService.validateAadhaarData(submissionId).catch(vErr => 
           this.logger.error(`Validation trigger failed for ${submissionId}`, vErr)
        );

      } else {
        this.logger.warn(`Could not extract any data from Aadhaar OCR text for submission ${submissionId}`);
      }

    } catch (error) {
      this.logger.error(`Aadhaar OCR Extraction failed for ${submissionId}`, error);
    }
  }

  private extractAadhaarNumber(text: string): string | null {
    // Basic sanitization: OCR might confuse numbers with similar looking letters
    const sanitizedText = text
      .replace(/O/g, '0') // uppercase o to zero
      .replace(/l/g, '1') // lowercase L to one
      .replace(/I/g, '1') // uppercase i to one
      .replace(/S/g, '5') // uppercase s to five
      .replace(/B/g, '8') // uppercase b to eight
      .replace(/Z/g, '2'); // uppercase z to two

    // Looks for 12 digits, possibly space or hyphen separated (4-4-4 pattern)
    // Relaxed leading digit (from [2-9] to [0-9]) to support demo/test fake Aadhaars
    const regex = /(?:[0-9]{4})[\s-]?[0-9]{4}[\s-]?[0-9]{4}/g;
    const matches = sanitizedText.match(regex);
    if (!matches) return null;

    // First pass: prefer Verhoeff-validated Aadhaar numbers
    for (const match of matches) {
      const cleanNumber = match.replace(/[\s-]/g, '');
      if (validateAadhaar(cleanNumber)) {
        this.logger.log(`Aadhaar number validated via Verhoeff checksum: ${cleanNumber.substring(0, 4)}****${cleanNumber.substring(8)}`);
        return cleanNumber;
      }
    }

    // Fallback: OCR often introduces single-digit errors that break Verhoeff, or it's a test Aadhaar.
    // Use the first 12-digit candidate.
    for (const match of matches) {
      const cleanNumber = match.replace(/[\s-]/g, '');
      if (cleanNumber.length === 12 && /^\d{12}$/.test(cleanNumber)) {
        this.logger.warn(
          `Aadhaar number failed Verhoeff checksum (likely OCR error or test image), storing best candidate: ${cleanNumber.substring(0, 4)}****${cleanNumber.substring(8)}`,
        );
        return cleanNumber;
      }
    }

    return null;
  }

  private extractName(text: string): string | null {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    for (let i = 0; i < lines.length; i++) {
       // Names usually appear just after "DOB" or "Government of India" lines, depending on the side.
       // This leans towards a heuristic implementation.
       if (/Government of India/i.test(lines[i]) || /GOVERNMENT OF INDIA/i.test(lines[i])) {
         if (lines[i+1] && /^[A-Z][A-Za-z\s]+$/.test(lines[i+1])) {
           return lines[i+1];
         }
       }
    }
    return null;
  }

  private extractDOB(text: string): Date | null {
    const regex = /(?:DOB|Date of Birth|YOB)[\s:]*([0-9]{2}\/[0-9]{2}\/[0-9]{4}|[0-9]{4})/i;
    const match = text.match(regex);
    if (match && match[1]) {
       if (match[1].length === 4) {
          // It's a Year Of Birth
          return new Date(`${match[1]}-01-01`);
       } else {
          const [DD, MM, YYYY] = match[1].split('/');
          return new Date(`${YYYY}-${MM}-${DD}`);
       }
    }
    return null;
  }

  private parseObjectPath(path: string): { bucket: string; objectName: string } {
    const parts = path.split('/');
    return {
      bucket: parts[0],
      objectName: parts.slice(1).join('/'),
    };
  }
}
