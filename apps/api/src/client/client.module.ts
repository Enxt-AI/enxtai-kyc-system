import { Module } from '@nestjs/common';
import { ClientService } from './client.service';
import { ClientController } from './client.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { WebhookModule } from '../webhooks/webhook.module';
import { StorageModule } from '../storage/storage.module';

/**
 * Client Module
 *
 * Encapsulates client management functionality for multi-tenancy support.
 * Provides ClientService for API key management, client CRUD operations,
 * and webhook configuration.
 *
 * @remarks
 * **Module Responsibilities**:
 * - Client authentication (API key validation)
 * - Client onboarding (create, generate API keys)
 * - Webhook configuration management
 * - Tenant context management
 * - Client portal API endpoints (/api/v1/client/*)
 *
 * **Exports**:
 * - ClientService: Used by TenantMiddleware and other modules
 *
 * **Controllers**:
 * - ClientController: Handles client portal API endpoints for webhook config, settings, and logs
 *
 * **Dependencies**:
 * - PrismaModule: Database access for client records
 * - WebhookModule: Webhook delivery and logging functionality
 * - StorageModule: MinIO presigned URL generation for document access
 *
 * **Future Enhancements**:
 * - Client analytics and usage tracking
 * - Billing integration
 */
@Module({
  imports: [PrismaModule, WebhookModule, StorageModule],
  controllers: [ClientController],
  providers: [ClientService],
  exports: [ClientService],
})
export class ClientModule {}
