import { HttpException, HttpStatus } from '@nestjs/common';

export class KycException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.BAD_REQUEST) {
    super({ error: 'KYC Error', message }, status);
  }
}
