import { Module } from '@nestjs/common';
import { AadhaarOcrService } from './aadhaar-ocr.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [AadhaarOcrService],
  exports: [AadhaarOcrService],
})
export class AadhaarOcrModule {}
