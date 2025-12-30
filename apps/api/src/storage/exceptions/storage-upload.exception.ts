import { HttpException, HttpStatus } from '@nestjs/common';

export class StorageUploadException extends HttpException {
  constructor(message: string, bucket: string, objectName?: string) {
    super(
      {
        error: 'Storage upload failed',
        detail: message,
        bucket,
        objectName,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
