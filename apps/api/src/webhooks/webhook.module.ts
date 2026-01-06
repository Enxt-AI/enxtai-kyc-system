import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { WebhookService } from './webhook.service';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Webhook Delivery Module
 * 
 * Provides webhook delivery infrastructure for sending real-time notifications
 * to client-configured endpoints. Handles HMAC-SHA256 signature generation,
 * HTTP delivery, and logging of all delivery attempts.
 * 
 * @remarks
 * ## Purpose
 * Enables clients to receive real-time notifications about KYC workflow events
 * without polling. Webhooks are sent for:
 * - Document uploads completion (`kyc.documents_uploaded`)
 * - Face verification completion (`kyc.verification_completed`)
 * - Admin status changes (`kyc.status_changed`)
 * 
 * ## Dependencies
 * - **PrismaModule**: Database access for fetching client webhook configuration
 *   and logging delivery attempts to `WebhookLog` table
 * - **HttpModule**: HTTP client for sending POST requests to client webhook URLs
 *   (uses Axios under the hood with configurable timeout and retry)
 * 
 * ## Exports
 * - **WebhookService**: Core service for webhook delivery, exported for use by:
 *   - `KycModule`: Trigger webhooks after document uploads and verification
 *   - `AdminModule`: Trigger webhooks after manual approval/rejection
 * 
 * ## Integration Points
 * This module is imported by:
 * - `AppModule`: Global registration for application-wide availability
 * - `KycModule`: Direct import for `KycService` webhook triggers
 * - `AdminModule`: Direct import for `AdminService` webhook triggers
 * 
 * ## Security Features
 * - HMAC-SHA256 signature generation using client webhook secret
 * - 10-second timeout to prevent slow endpoints from blocking system
 * - Comprehensive logging for debugging and monitoring
 * - Error isolation (webhook failures don't break KYC workflow)
 * 
 * @see WebhookService for webhook delivery implementation details
 * @see WebhookPayload for webhook payload structure
 * @see WebhookEvent for available event types
 * 
 * @example
 * ```typescript
 * // Import WebhookModule in KycModule
 * @Module({
 *   imports: [WebhookModule, ...],
 *   providers: [KycService],
 * })
 * export class KycModule {}
 * 
 * // Use WebhookService in KycService
 * constructor(private readonly webhookService: WebhookService) {}
 * 
 * async uploadDocument() {
 *   // ... upload logic ...
 *   await this.webhookService.sendWebhook(
 *     clientId,
 *     WebhookEvent.KYC_DOCUMENTS_UPLOADED,
 *     { kycSessionId, externalUserId, status }
 *   );
 * }
 * ```
 */
@Module({
  imports: [
    PrismaModule, // Provides PrismaService for database access
    HttpModule,   // Provides HttpService for HTTP requests (Axios wrapper)
  ],
  providers: [WebhookService],
  exports: [WebhookService], // Export for use in KycModule and AdminModule
})
export class WebhookModule {}
