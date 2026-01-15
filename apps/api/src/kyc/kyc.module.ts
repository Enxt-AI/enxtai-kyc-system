import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { OcrModule } from '../ocr/ocr.module';
import { FaceRecognitionModule } from '../face-recognition/face-recognition.module';
import { ClientModule } from '../client/client.module';
import { WebhookModule } from '../webhooks/webhook.module';
import { DigiLockerModule } from '../digilocker/digilocker.module';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';

/**
 * KYC Module
 *
 * Handles KYC verification workflows including document upload, OCR, face recognition,
 * and CVL KRA integration.
 *
 * @remarks
 * **Multi-Tenancy Support**:
 * - ClientModule imported for future tenant-scoped operations
 * - KycService will inject ClientService in future phases
 * - Storage operations will include clientId parameter for tenant isolation
 *
 * **Webhook Integration**:
 * - WebhookModule imported for real-time status change notifications
 * - Webhooks triggered after document uploads and verification completion
 */
@Module({
  imports: [
    PrismaModule,
    StorageModule,
    OcrModule,
    FaceRecognitionModule,
    ClientModule, // Future multi-tenancy support
    WebhookModule, // Webhook delivery for status change notifications
    DigiLockerModule, // DigiLocker document fetching integration
  ],
  controllers: [KycController],
  providers: [KycService],
  exports: [KycService], // Export for ClientKycModule and other consumers
})
export class KycModule {}
