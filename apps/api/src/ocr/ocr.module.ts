import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { OcrService } from './ocr.service';

@Module({
  imports: [ConfigModule, PrismaModule, StorageModule],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
