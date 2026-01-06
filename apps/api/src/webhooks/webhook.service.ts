import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { PrismaService } from '../prisma/prisma.service';
import { WebhookEvent } from './webhook-events.enum';
import { WebhookPayload } from './webhook-payload.interface';
import { randomUUID } from 'crypto';
import * as crypto from 'crypto';
import { firstValueFrom } from 'rxjs';

/**
 * Webhook Delivery Service
 * 
 * Handles secure webhook delivery to client-configured endpoints with HMAC-SHA256
 * signature generation for payload verification. All webhook delivery attempts
 * are logged to the database for debugging and monitoring.
 * 
 * @remarks
 * ## Webhook Delivery Flow
 * 1. Service receives webhook trigger with client ID, event type, and data
 * 2. Fetch client record to get webhook URL and secret (return early if not configured)
 * 3. Generate unique event ID and build standardized payload
 * 4. Generate HMAC-SHA256 signature using client's webhook secret
 * 5. Send HTTP POST request with signature in headers
 * 6. Log delivery attempt (success or failure) to WebhookLog table
 * 7. Errors are logged but not thrown (webhook failures don't break KYC flow)
 * 
 * ## Security Considerations
 * - **HTTPS Required**: Webhook URLs should use HTTPS to prevent eavesdropping
 * - **HMAC Signature**: All payloads signed with HMAC-SHA256 for verification
 * - **Secret Rotation**: Clients should rotate webhook secrets periodically
 * - **Timeout**: 10-second timeout prevents slow endpoints from blocking system
 * - **Replay Protection**: Clients should check timestamp to reject old webhooks
 * 
 * ## Error Handling Strategy
 * Webhook delivery errors are logged but do not throw exceptions. This ensures:
 * - KYC workflow continues even if client webhook is down
 * - No data loss (delivery attempts logged for retry/debugging)
 * - System stability not dependent on external client endpoints
 * 
 * Future enhancement: Implement automatic retry with exponential backoff
 * 
 * @see WebhookPayload for payload structure documentation
 * @see WebhookEvent for available event types
 * 
 * @example
 * ```typescript
 * // Trigger webhook after document upload
 * await this.webhookService.sendWebhook(
 *   clientId,
 *   WebhookEvent.KYC_DOCUMENTS_UPLOADED,
 *   {
 *     kycSessionId: submission.id,
 *     externalUserId: user.externalUserId,
 *     status: submission.internalStatus,
 *   }
 * );
 * ```
 */
@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
  ) {}

  /**
   * Send webhook to client's configured endpoint
   * 
   * @remarks
   * This method handles the complete webhook delivery flow:
   * 1. Validate client has webhook configured (return early if not)
   * 2. Build standardized payload with event metadata
   * 3. Generate HMAC-SHA256 signature for verification
   * 4. Send HTTP POST request with signature headers
   * 5. Log delivery attempt with status code and response/error details
   * 
   * ## Error Handling
   * - Network errors: Logged with error message, status code null
   * - HTTP errors (4xx/5xx): Logged with status code and response body
   * - Timeout (10s): Logged as network error
   * - All errors caught and logged, returns failure result
   * 
   * ## Delivery Logging
   * All delivery attempts logged to `WebhookLog` table with:
   * - Client ID and event type for filtering
   * - Success/failure status
   * - HTTP status code (or null for network errors)
   * - Response body (truncated to 1000 chars) or error message
   * - Timestamp for debugging
   * 
   * ## Retry Strategy (Post-MVP)
   * Current implementation: Single delivery attempt, failures logged for manual retry
   * Future enhancement: Automatic retry with exponential backoff (e.g., 1m, 5m, 30m)
   * 
   * @param clientId - Client UUID (from authentication middleware)
   * @param event - Webhook event type (documents_uploaded, verification_completed, etc.)
   * @param data - Event-specific data (kycSessionId, status, scores, etc.)
   * 
   * @returns Promise<{ success: boolean, statusCode: number | null, error?: string }> - Delivery result
   * 
   * @example
   * ```typescript
   * // Example: Send verification completed webhook
   * const result = await this.webhookService.sendWebhook(
   *   'client-uuid-123',
   *   WebhookEvent.KYC_VERIFICATION_COMPLETED,
   *   {
   *     kycSessionId: 'sub_abc123',
   *     externalUserId: 'customer-456',
   *     status: InternalStatus.FACE_VERIFIED,
   *     extractedData: {
   *       panNumber: 'ABCDE1234F',
   *       fullName: 'John Doe',
   *     },
   *     verificationScores: {
   *       faceMatchScore: 0.87,
   *       livenessScore: 0.92,
   *     },
   *   }
   * );
   * console.log(result.success ? 'Delivered' : result.error);
   * ```
   */
  async sendWebhook(
    clientId: string,
    event: WebhookEvent,
    data: any,
  ): Promise<{ success: boolean; statusCode: number | null; error?: string }> {
    try {
      // Fetch client configuration
      const client = await this.prisma.client.findUnique({
        where: { id: clientId },
        select: {
          id: true,
          webhookUrl: true,
          webhookSecret: true,
        },
      });

      // Return early if webhook not configured (no URL)
      if (!client || !client.webhookUrl) {
        this.logger.debug(
          `No webhook configured for client ${clientId}, skipping delivery`,
        );
        return { success: false, statusCode: null, error: 'Webhook not configured' };
      }

      // Return early if webhook secret not configured (can't generate signature)
      if (!client.webhookSecret) {
        this.logger.warn(
          `Webhook URL configured but no secret for client ${clientId}, skipping delivery`,
        );
        return { success: false, statusCode: null, error: 'Webhook secret not configured' };
      }

      // Build standardized webhook payload
      const payload: WebhookPayload = {
        id: `evt_${randomUUID()}`, // Unique event ID for idempotency
        event,
        timestamp: new Date().toISOString(),
        data,
      };

      // Generate HMAC-SHA256 signature for verification
      const signature = this.generateSignature(payload, client.webhookSecret);

      // Send HTTP POST request with signature headers
      this.logger.log(
        `Sending webhook to ${client.webhookUrl} for event ${event}`,
      );

      const response = await firstValueFrom(
        this.httpService.post(client.webhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json',
            'X-Signature': signature,
            'X-Event': event,
          },
          timeout: 10000, // 10-second timeout
        }),
      );

      // Log successful delivery
      await this.prisma.webhookLog.create({
        data: {
          clientId: client.id,
          event,
          payload: payload as any, // Prisma JSON type
          responseStatus: response.status,
          responseBody: JSON.stringify(response.data).substring(0, 1000), // Truncate to 1000 chars
        },
      });

      this.logger.log(
        `Webhook delivered successfully (${response.status}) for event ${event}`,
      );

      // Return success result
      return { success: true, statusCode: response.status };
    } catch (error: any) {
      // Log delivery failure (network error or HTTP error)
      const statusCode = error?.response?.status || 0;
      const errorMessage =
        error?.response?.data || error?.message || 'Unknown error';

      this.logger.error(
        `Webhook delivery failed for event ${event}: ${errorMessage}`,
        error?.stack,
      );

      // Log failed delivery attempt to database
      try {
        await this.prisma.webhookLog.create({
          data: {
            clientId,
            event,
            payload: {
              id: `evt_${randomUUID()}`,
              event,
              timestamp: new Date().toISOString(),
              data,
            } as any,
            responseStatus: statusCode,
            responseBody: JSON.stringify(errorMessage).substring(0, 1000),
          },
        });
      } catch (logError: any) {
        // If logging fails, only log to console (don't throw)
        this.logger.error(
          `Failed to log webhook delivery error: ${logError?.message}`,
        );
      }

      // Return failure result
      return {
        success: false,
        statusCode: statusCode || null,
        error: typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage),
      };
    }
  }

  /**
   * Get Webhook Logs
   * 
   * Retrieves paginated webhook delivery logs for a specific client.
   * 
   * @param clientId - Client UUID
   * @param skip - Number of logs to skip (for pagination)
   * @param take - Number of logs to return (page size)
   * @returns Array of webhook logs ordered by createdAt desc
   */
  async getWebhookLogs(clientId: string, skip: number, take: number) {
    return this.prisma.webhookLog.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        event: true,
        responseStatus: true,
        createdAt: true,
        attemptCount: true,
      },
    });
  }

  /**
   * Get Webhook Logs Count
   * 
   * Returns total count of webhook logs for a specific client.
   * Used for pagination metadata.
   * 
   * @param clientId - Client UUID
   * @returns Total number of webhook logs
   */
  async getWebhookLogsCount(clientId: string): Promise<number> {
    return this.prisma.webhookLog.count({
      where: { clientId },
    });
  }

  /**
   * Generate HMAC-SHA256 signature for webhook payload verification
   * 
   * @remarks
   * Clients MUST verify this signature before processing webhooks to ensure:
   * - **Authenticity**: Webhook came from legitimate KYC system
   * - **Integrity**: Payload was not tampered with in transit
   * - **Non-repudiation**: Proof that system sent the webhook
   * 
   * ## Algorithm
   * 1. Serialize payload to JSON string (consistent ordering)
   * 2. Create HMAC with SHA-256 algorithm and client's webhook secret
   * 3. Return hex-encoded digest
   * 
   * ## Security Rationale
   * - **HMAC-SHA256**: Industry-standard algorithm (used by GitHub, Stripe, etc.)
   * - **Secret Key**: Only known by KYC system and client (shared during onboarding)
   * - **Hex Encoding**: Human-readable format for debugging
   * - **JSON Serialization**: Deterministic string representation of payload
   * 
   * ## Client-Side Verification Example
   * ```typescript
   * // Node.js/Express webhook handler
   * import crypto from 'crypto';
   * 
   * app.post('/webhooks/kyc', (req, res) => {
   *   // Get signature from header
   *   const receivedSignature = req.headers['x-signature'];
   *   
   *   // Serialize payload exactly as server does
   *   const payload = JSON.stringify(req.body);
   *   
   *   // Compute expected signature using your webhook secret
   *   const expectedSignature = crypto
   *     .createHmac('sha256', process.env.WEBHOOK_SECRET)
   *     .update(payload)
   *     .digest('hex');
   *   
   *   // Verify signatures match (constant-time comparison)
   *   if (receivedSignature !== expectedSignature) {
   *     console.error('Invalid webhook signature!');
   *     return res.status(401).json({ error: 'Invalid signature' });
   *   }
   *   
   *   // Signature valid - process webhook safely
   *   const { event, data } = req.body;
   *   console.log(`KYC event: ${event}, Session: ${data.kycSessionId}`);
   *   
   *   // Update your database, send notifications, etc.
   *   
   *   // Acknowledge receipt
   *   res.status(200).json({ received: true });
   * });
   * ```
   * 
   * ## Best Practices for Clients
   * 1. **Always verify signature** before processing webhook
   * 2. **Use constant-time comparison** to prevent timing attacks
   * 3. **Check timestamp** to reject old webhooks (replay protection)
   * 4. **Acknowledge quickly** (respond 200 OK within seconds)
   * 5. **Process async** (queue webhook for background processing)
   * 6. **Rotate secrets** periodically (every 90 days recommended)
   * 7. **Use HTTPS** for webhook URL (prevent eavesdropping)
   * 
   * @param payload - The webhook payload object to sign
   * @param secret - Client's webhook secret (from database)
   * 
   * @returns Hex-encoded HMAC-SHA256 signature
   * 
   * @private Internal helper method (not exposed to other services)
   * 
   * @example
   * ```typescript
   * const payload = {
   *   id: 'evt_123',
   *   event: 'kyc.documents_uploaded',
   *   timestamp: '2026-01-05T10:30:00Z',
   *   data: { kycSessionId: 'sub_456' }
   * };
   * 
   * const signature = this.generateSignature(payload, 'client_secret_abc123');
   * // Returns: 'a1b2c3d4e5f6...' (64 hex characters)
   * ```
   */
  private generateSignature(payload: any, secret: string): string {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', secret).update(payloadString).digest('hex');
  }
}
