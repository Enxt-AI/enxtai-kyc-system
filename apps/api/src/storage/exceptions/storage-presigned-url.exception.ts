import { HttpException, HttpStatus } from '@nestjs/common';

export class StoragePresignedUrlException extends HttpException {
  constructor(message: string, bucket: string, objectName: string) {
    super(
      {
        error: 'Storage presigned URL generation failed',
        detail: message,
        bucket,
        objectName,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
