import { Module } from '@nestjs/common';
import { AadhaarQrService } from './aadhaar-qr.service';

@Module({
  providers: [AadhaarQrService],
  exports: [AadhaarQrService],
})
export class AadhaarQrModule {}
