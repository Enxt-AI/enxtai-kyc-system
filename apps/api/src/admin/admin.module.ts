import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { WebhookModule } from '../webhooks/webhook.module';
import { ClientModule } from '../client/client.module';
import { AdminService } from './admin.service';
import { AdminController } from './admin.controller';

/**
 * Admin Module
 * 
 * Provides admin-only endpoints for managing KYC submissions, users, and clients.
 * 
 * @remarks
 * **Webhook Integration**:
 * - WebhookModule imported for status change notifications
 * - Webhooks triggered after manual approval/rejection of submissions
 * 
 * **Client Management**:
 * - ClientModule imported for API key generation and client operations
 * - Enables super admin to onboard and manage client organizations
 */
@Module({
  imports: [PrismaModule, StorageModule, WebhookModule, ClientModule],
  providers: [AdminService],
  controllers: [AdminController],
  exports: [AdminService],
})
export class AdminModule {}
