import { InternalStatus } from '@prisma/client';
import { WebhookEvent } from './webhook-events.enum';

/**
 * Standardized Webhook Payload Structure
 * 
 * Defines the structure of webhook payloads sent to client webhook endpoints.
 * All webhook events follow this consistent format for easy parsing and processing.
 * 
 * @remarks
 * Webhooks are sent as HTTP POST requests with the following headers:
 * - `Content-Type: application/json`
 * - `X-Signature: {hmac-sha256-signature}` - HMAC signature for verification
 * - `X-Event: {event-type}` - The webhook event type
 * 
 * The payload is signed with the client's webhook secret using HMAC-SHA256.
 * Clients MUST verify the signature before processing the webhook to ensure
 * authenticity and prevent tampering.
 * 
 * @see WebhookEvent for available event types
 * @see WebhookService.generateSignature for signature generation details
 * 
 * @example
 * ```typescript
 * // Example webhook payload for verification completed event
 * const payload: WebhookPayload = {
 *   id: 'evt_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
 *   event: WebhookEvent.KYC_VERIFICATION_COMPLETED,
 *   timestamp: '2026-01-05T10:35:00.000Z',
 *   data: {
 *     kycSessionId: 'sub_123abc-456def-789ghi',
 *     externalUserId: 'customer-456',
 *     status: InternalStatus.FACE_VERIFIED,
 *     extractedData: {
 *       panNumber: 'ABCDE1234F',
 *       aadhaarNumber: 'XXXX XXXX 1234',
 *       fullName: 'John Doe',
 *       dateOfBirth: '1990-01-15'
 *     },
 *     verificationScores: {
 *       faceMatchScore: 0.87,
 *       livenessScore: 0.92
 *     }
 *   }
 * };
 * ```
 */
export interface WebhookPayload {
  /**
   * Unique webhook event identifier (UUID v4)
   * 
   * @remarks
   * Generated for each webhook delivery attempt. Can be used for:
   * - Idempotency checking (detect duplicate deliveries)
   * - Debugging and log correlation
   * - Event ordering and sequencing
   * 
   * @example 'evt_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'
   */
  id: string;

  /**
   * Webhook event type
   * 
   * @remarks
   * Indicates what triggered the webhook. Clients can use this field to route
   * the webhook to appropriate handlers without parsing the entire payload.
   * 
   * Available event types:
   * - `kyc.documents_uploaded` - All required documents uploaded
   * - `kyc.verification_completed` - Face verification completed
   * - `kyc.status_changed` - Admin manually changed submission status
   * 
   * @see WebhookEvent enum for detailed descriptions
   */
  event: WebhookEvent;

  /**
   * Webhook generation timestamp (ISO 8601 format)
   * 
   * @remarks
   * UTC timestamp when the webhook was generated. Can be used for:
   * - Replay attack detection (reject old webhooks)
   * - Event ordering and sequencing
   * - Latency monitoring
   * 
   * @example '2026-01-05T10:35:00.000Z'
   */
  timestamp: string;

  /**
   * Event-specific webhook data
   * 
   * @remarks
   * Contains KYC submission details relevant to the event. All events include
   * `kycSessionId`, `externalUserId`, and `status`. Additional fields are
   * populated based on the event type and current submission state.
   */
  data: {
    /**
     * KYC submission identifier (internal UUID)
     * 
     * @remarks
     * The unique identifier for the KYC submission. Clients should store this
     * alongside their `externalUserId` for future status queries and correlation.
     * 
     * @example 'sub_123abc-456def-789ghi'
     */
    kycSessionId: string;

    /**
     * Client's user identifier
     * 
     * @remarks
     * The external user ID provided by the client during KYC initiation. This
     * allows clients to correlate webhook events with their own user records
     * without storing internal KYC session IDs.
     * 
     * @example 'customer-456'
     */
    externalUserId: string;

    /**
     * Current KYC submission status
     * 
     * @remarks
     * The current internal status of the KYC submission. Possible values:
     * - `PENDING_DOCUMENTS` - Waiting for document uploads
     * - `DOCUMENTS_UPLOADED` - All documents uploaded, verification pending
     * - `FACE_VERIFIED` - Auto-approved after successful face verification
     * - `PENDING_REVIEW` - Manual review required (low verification scores)
     * - `VERIFIED` - Manually approved by admin
     * - `REJECTED` - Rejected by admin or system
     * 
     * @see InternalStatus enum in Prisma schema
     */
    status: InternalStatus;

    /**
     * OCR-extracted data from uploaded documents
     * 
     * @remarks
     * Populated after document processing completes. Available in:
     * - `KYC_VERIFICATION_COMPLETED` event
     * - `KYC_STATUS_CHANGED` event (if verification already completed)
     * 
     * Not included in `KYC_DOCUMENTS_UPLOADED` event as OCR processing may
     * still be in progress.
     * 
     * @optional Only included if OCR extraction succeeded
     */
    extractedData?: {
      /**
       * PAN (Permanent Account Number)
       * 
       * @remarks
       * Extracted from PAN card document using OCR. Format: ABCDE1234F
       * 
       * @optional Only included if PAN document processed successfully
       * @example 'ABCDE1234F'
       */
      panNumber?: string;

      /**
       * Aadhaar number (masked)
       * 
       * @remarks
       * Extracted from Aadhaar card, with first 8 digits masked for security.
       * Format: XXXX XXXX 1234
       * 
       * @optional Only included if Aadhaar document processed successfully
       * @example 'XXXX XXXX 1234'
       */
      aadhaarNumber?: string;

      /**
       * Full name from identity documents
       * 
       * @remarks
       * Extracted from PAN or Aadhaar card. If both documents processed, PAN
       * name takes precedence (more standardized format).
       * 
       * @optional Only included if name extraction succeeded
       * @example 'John Doe'
       */
      fullName?: string;

      /**
       * Date of birth (YYYY-MM-DD format)
       * 
       * @remarks
       * Extracted from Aadhaar card (PAN cards don't contain DOB). Format is
       * normalized to ISO 8601 date string.
       * 
       * @optional Only included if DOB extraction succeeded from Aadhaar
       * @example '1990-01-15'
       */
      dateOfBirth?: string;
    };

    /**
     * Face verification and liveness detection scores
     * 
     * @remarks
     * Populated after face verification completes using face-api.js. Available in:
     * - `KYC_VERIFICATION_COMPLETED` event (always included)
     * - `KYC_STATUS_CHANGED` event (if verification already completed)
     * 
     * Not included in `KYC_DOCUMENTS_UPLOADED` event as verification hasn't
     * started yet.
     * 
     * Scores range from 0.0 to 1.0, where higher values indicate better matches
     * and more confident liveness detection.
     * 
     * @optional Only included if face verification completed
     */
    verificationScores?: {
      /**
       * Face matching score (0.0 - 1.0)
       * 
       * @remarks
       * Measures similarity between the live photo and the face extracted from
       * identity documents (PAN/Aadhaar). Calculated using face-api.js
       * FaceRecognitionNet model.
       * 
       * Interpretation:
       * - >= 0.6: Auto-approved (high confidence match)
       * - < 0.6: Manual review required (potential mismatch)
       * 
       * @example 0.87 (87% confidence match)
       */
      faceMatchScore?: number;

      /**
       * Liveness detection score (0.0 - 1.0)
       * 
       * @remarks
       * Measures confidence that the live photo is of a real person (not a
       * printed photo, screen, or mask). Calculated using face-api.js age
       * detection and expression analysis.
       * 
       * Interpretation:
       * - >= 0.7: Auto-approved (confident real person)
       * - < 0.7: Manual review required (potential spoof attempt)
       * 
       * @example 0.92 (92% confidence real person)
       */
      livenessScore?: number;
    };

    /**
     * Rejection reason (for rejected submissions)
     * 
     * @remarks
     * Human-readable explanation for why the KYC submission was rejected.
     * Provided by admin user during manual rejection.
     * 
     * Only included in:
     * - `KYC_STATUS_CHANGED` event when status is `REJECTED`
     * 
     * Not included for auto-approved or pending review submissions.
     * 
     * @optional Only included if submission was rejected
     * @example 'Document quality insufficient - PAN card image blurry'
     */
    rejectionReason?: string;
  };
}
