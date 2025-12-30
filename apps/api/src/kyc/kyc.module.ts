import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { OcrModule } from '../ocr/ocr.module';
import { FaceRecognitionModule } from '../face-recognition/face-recognition.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [PrismaModule, StorageModule, OcrModule, FaceRecognitionModule],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
