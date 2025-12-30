import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import FormData from 'form-data';
import { MlClientException } from './exceptions/ml-client.exception';
import {
  FaceExtractionResult,
  FaceVerificationResult,
  LivenessDetectionResult,
  FaceVerificationWorkflowResult,
} from './interfaces/ml-client.interface';

interface MultipartPart {
  field: string;
  buffer: Buffer;
  filename: string;
  contentType?: string;
}

@Injectable()
export class MlClientService {
  private readonly logger = new Logger(MlClientService.name);
  private readonly baseUrl: string;
  private readonly timeout: number;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.baseUrl = this.configService.get<string>('ML_SERVICE_URL', 'http://ml-service:8000');
    this.timeout = Number(this.configService.get<string>('ML_SERVICE_TIMEOUT_MS', '15000'));
  }

  async verifyFaceWorkflow(
    livePhoto: Buffer,
    panDocument: Buffer,
    aadhaarDocument: Buffer,
  ): Promise<FaceVerificationWorkflowResult> {
    let documentUsed: FaceVerificationWorkflowResult['documentUsed'] = 'PAN';
    let extraction: FaceExtractionResult | undefined;

    try {
      extraction = await this.extractFace(panDocument, 'pan.jpg');
    } catch (err: any) {
      this.logger.warn(`PAN face extraction failed: ${err?.message ?? 'unknown error'}`);
    }

    if (!extraction?.face_found) {
      documentUsed = 'AADHAAR';
      try {
        extraction = await this.extractFace(aadhaarDocument, 'aadhaar.jpg');
      } catch (err: any) {
        this.logger.warn(`Aadhaar face extraction failed: ${err?.message ?? 'unknown error'}`);
      }
    }

    if (!extraction?.face_found) {
      throw new MlClientException('Unable to extract face from uploaded documents', 'verify-face-workflow');
    }

    const verification = await this.verifyFace(
      livePhoto,
      documentUsed === 'PAN' ? panDocument : aadhaarDocument,
      'live-photo.jpg',
      `${documentUsed.toLowerCase()}.jpg`,
    );

    const liveness = await this.detectLiveness(livePhoto, 'live-photo.jpg');

    const faceMatchScore = verification.confidence ?? 0;
    const livenessScore = liveness.confidence ?? 0;
    const verified = Boolean(verification.verified && liveness.is_live);

    return {
      verified,
      faceMatchScore,
      livenessScore,
      faceExtractionSuccess: Boolean(extraction.success && extraction.face_found),
      documentUsed,
    };
  }

  async extractFace(document: Buffer, filename: string): Promise<FaceExtractionResult> {
    return this.postMultipart<FaceExtractionResult>('extract-face', [
      { field: 'document', buffer: document, filename, contentType: 'image/jpeg' },
    ], 'extract-face');
  }

  async verifyFace(
    livePhoto: Buffer,
    documentPhoto: Buffer,
    liveFilename: string,
    documentFilename: string,
  ): Promise<FaceVerificationResult> {
    return this.postMultipart<FaceVerificationResult>('verify-face', [
      { field: 'live_photo', buffer: livePhoto, filename: liveFilename, contentType: 'image/jpeg' },
      { field: 'document_photo', buffer: documentPhoto, filename: documentFilename, contentType: 'image/jpeg' },
    ], 'verify-face');
  }

  async detectLiveness(photo: Buffer, filename: string): Promise<LivenessDetectionResult> {
    return this.postMultipart<LivenessDetectionResult>('detect-liveness', [
      { field: 'photo', buffer: photo, filename, contentType: 'image/jpeg' },
    ], 'detect-liveness');
  }

  private async postMultipart<T>(path: string, parts: MultipartPart[], operation: string): Promise<T> {
    const form = new FormData();
    for (const part of parts) {
      form.append(part.field, part.buffer, {
        filename: part.filename,
        contentType: part.contentType ?? 'application/octet-stream',
      });
    }

    try {
      const res = await this.httpService.axiosRef.post(`${this.baseUrl}/api/${path}`, form, {
        headers: form.getHeaders(),
        timeout: this.timeout,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      });
      return res.data as T;
    } catch (err: any) {
      const detail = err?.response?.data?.detail ?? err?.response?.data?.message ?? err?.message ?? 'Unknown error';
      this.logger.error(`ML request failed for ${operation}: ${detail}`);
      throw new MlClientException(detail, operation);
    }
  }
}
