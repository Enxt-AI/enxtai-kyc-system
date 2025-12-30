import { HttpException, HttpStatus } from '@nestjs/common';

export class StorageDeleteException extends HttpException {
  constructor(message: string, bucket: string, objectName: string) {
    super(
      {
        error: 'Storage delete failed',
        detail: message,
        bucket,
        objectName,
      },
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  }
}
