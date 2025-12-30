import { HttpException, HttpStatus } from '@nestjs/common';

export class StorageDownloadException extends HttpException {
  constructor(message: string, bucket: string, objectName: string) {
    super(
      {
        error: 'Storage download failed',
        detail: message,
        bucket,
        objectName,
      },
      HttpStatus.NOT_FOUND,
    );
  }
}
