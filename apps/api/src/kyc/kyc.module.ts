import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { OcrModule } from '../ocr/ocr.module';
import { MlClientModule } from '../ml-client/ml-client.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

@Module({
  imports: [PrismaModule, StorageModule, OcrModule, MlClientModule],
  controllers: [KycController],
  providers: [KycService],
})
export class KycModule {}
