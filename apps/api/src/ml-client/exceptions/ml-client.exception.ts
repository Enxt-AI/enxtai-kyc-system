import { HttpException, HttpStatus } from '@nestjs/common';

export class MlClientException extends HttpException {
  constructor(message: string, operation: string) {
    super(`ML Service Error [${operation}]: ${message}`, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}
