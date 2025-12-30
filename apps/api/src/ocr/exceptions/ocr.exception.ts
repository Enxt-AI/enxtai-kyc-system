import { HttpException, HttpStatus } from '@nestjs/common';

export enum OcrErrorCode {
  OCR_FAILED = 'OCR_FAILED',
  POOR_IMAGE_QUALITY = 'POOR_IMAGE_QUALITY',
  DATA_EXTRACTION_FAILED = 'DATA_EXTRACTION_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
}

export class OcrException extends HttpException {
  constructor(
    message: string,
    code: OcrErrorCode = OcrErrorCode.OCR_FAILED,
    status: HttpStatus = HttpStatus.BAD_REQUEST,
  ) {
    super({ error: 'OCR Error', code, message }, status);
  }
}
