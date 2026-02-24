/**
 * Webhook Event Types
 *
 * Defines the types of webhook events that can be triggered during the KYC workflow.
 * Each event represents a significant state change in the KYC submission lifecycle.
 *
 * @remarks
 * Webhook events are sent to the client's configured webhook URL with an HMAC-SHA256
 * signature for verification. All events include the KYC session ID, external user ID,
 * and current status in the payload.
 *
 * @see WebhookPayload for the standardized payload structure
 * @see WebhookService for webhook delivery implementation
 */
export enum WebhookEvent {
  /**
   * Triggered when all required documents have been uploaded
   *
   * @remarks
   * This event is sent after the live photo upload completes, indicating that all
   * required documents (PAN, Aadhaar front/back, live photo) are now available.
   *
   * Payload includes:
   * - `kycSessionId`: The KYC submission ID
   * - `externalUserId`: Client's user identifier
   * - `status`: Will be `DOCUMENTS_UPLOADED`
   *
   * @example
   * ```json
   * {
   *   "id": "evt_a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
   *   "event": "kyc.documents_uploaded",
   *   "timestamp": "2026-01-05T10:30:00.000Z",
   *   "data": {
   *     "kycSessionId": "sub_123abc-456def-789ghi",
   *     "externalUserId": "customer-456",
   *     "status": "DOCUMENTS_UPLOADED"
   *   }
   * }
   * ```
   */
  KYC_DOCUMENTS_UPLOADED = 'kyc.documents_uploaded',

  /**
   * Triggered after face verification completes (auto-approved or pending review)
   *
   * @remarks
   * This event is sent immediately after the face-api.js verification runs, which
   * happens after document uploads complete. The submission status will be either
   * `FACE_VERIFIED` (auto-approved if scores exceed thresholds) or `PENDING_REVIEW`
   * (manual review required if scores are below thresholds).
   *
   * Payload includes:
   * - `kycSessionId`: The KYC submission ID
   * - `externalUserId`: Client's user identifier
   * - `status`: Either `FACE_VERIFIED` or `PENDING_REVIEW`
   * - `extractedData`: OCR results from PAN and Aadhaar documents
   * - `verificationScores`: Face match and liveness detection scores
   *
   * @example
   * ```json
   * {
   *   "id": "evt_b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e",
   *   "event": "kyc.verification_completed",
   *   "timestamp": "2026-01-05T10:35:00.000Z",
   *   "data": {
   *     "kycSessionId": "sub_123abc-456def-789ghi",
   *     "externalUserId": "customer-456",
   *     "status": "FACE_VERIFIED",
   *     "extractedData": {
   *       "panNumber": "ABCDE1234F",
   *       "aadhaarNumber": "XXXX XXXX 1234",
   *       "fullName": "John Doe",
   *       "dateOfBirth": "1990-01-15"
   *     },
   *     "verificationScores": {
   *       "faceMatchScore": 0.87,
   *       "livenessScore": 0.92
   *     }
   *   }
   * }
   * ```
   */
  KYC_VERIFICATION_COMPLETED = 'kyc.verification_completed',

  /**
   * Triggered when admin manually approves or rejects a submission
   *
   * @remarks
   * This event is sent when an admin user takes manual action on a KYC submission,
   * changing the status to `VERIFIED` (approval) or `REJECTED` (rejection). This
   * typically happens for submissions in `PENDING_REVIEW` status or when admin
   * overrides an auto-approved submission.
   *
   * Payload includes:
   * - `kycSessionId`: The KYC submission ID
   * - `externalUserId`: Client's user identifier
   * - `status`: Either `VERIFIED` or `REJECTED`
   * - `rejectionReason`: Included only if status is `REJECTED`
   *
   * @example
   * ```json
   * {
   *   "id": "evt_c3d4e5f6-a7b8-4c9d-0e1f-2a3b4c5d6e7f",
   *   "event": "kyc.status_changed",
   *   "timestamp": "2026-01-05T11:00:00.000Z",
   *   "data": {
   *     "kycSessionId": "sub_123abc-456def-789ghi",
   *     "externalUserId": "customer-456",
   *     "status": "REJECTED",
   *     "rejectionReason": "Document quality insufficient - PAN card image blurry"
   *   }
   * }
   * ```
   */
  KYC_STATUS_CHANGED = 'kyc.status_changed',

  /**
   * Test webhook event for endpoint verification
   *
   * @remarks
   * This event is triggered manually by clients from the settings page to test
   * their webhook endpoint connectivity and configuration. Used to verify HTTPS
   * endpoint accessibility and signature verification before going live.
   *
   * Payload includes:
   * - `message`: Test message confirming webhook delivery
   *
   * @example
   * ```json
   * {
   *   "id": "evt_test_d4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a",
   *   "event": "kyc.test",
   *   "timestamp": "2026-01-06T10:30:00.000Z",
   *   "data": {
   *     "message": "Test webhook from EnxtAI KYC"
   *   }
   * }
   * ```
   */
  KYC_TEST = 'kyc.test',

  /**
   * Triggered when DigiLocker document fetch is initiated
   *
   * @remarks
   * This event is sent when a user initiates document fetch from DigiLocker.
   * Indicates that the fetch process has started but documents are not yet available.
   *
   * Payload includes:
   * - `kycSessionId`: The KYC submission ID
   * - `externalUserId`: Client's user identifier
   * - `documentTypes`: Array of document types being fetched
   *
   * @example
   * ```json
   * {
   *   "id": "evt_dl_fetch_init_123",
   *   "event": "kyc.digilocker_fetch_initiated",
   *   "timestamp": "2026-01-14T10:30:00.000Z",
   *   "data": {
   *     "kycSessionId": "sub_123abc-456def-789ghi",
   *     "externalUserId": "customer-456",
   *     "documentTypes": ["PAN", "AADHAAR"]
   *   }
   * }
   * ```
   */
  KYC_DIGILOCKER_FETCH_INITIATED = 'kyc.digilocker_fetch_initiated',

  /**
   * Triggered when DigiLocker document fetch completes successfully
   *
   * @remarks
   * This event is sent after all requested documents have been successfully
   * fetched from DigiLocker and stored in the system. The submission status
   * will be updated to DOCUMENTS_UPLOADED.
   *
   * Payload includes:
   * - `kycSessionId`: The KYC submission ID
   * - `externalUserId`: Client's user identifier
   * - `documentsFetched`: Array of document types successfully fetched
   * - `documentUrls`: Object with MinIO URLs for fetched documents
   *
   * @example
   * ```json
   * {
   *   "id": "evt_dl_fetch_comp_456",
   *   "event": "kyc.digilocker_fetch_completed",
   *   "timestamp": "2026-01-14T10:35:00.000Z",
   *   "data": {
   *     "kycSessionId": "sub_123abc-456def-789ghi",
   *     "externalUserId": "customer-456",
   *     "documentsFetched": ["PAN", "AADHAAR"],
   *     "documentUrls": {
   *       "panDocumentUrl": "minio://kyc/pan-123.jpg",
   *       "aadhaarFrontUrl": "minio://kyc/aadhaar-456.jpg"
   *     }
   *   }   * }   * }
   * ```
   */
  KYC_DIGILOCKER_FETCH_COMPLETED = 'kyc.digilocker_fetch_completed',

  /**
   * Triggered when DigiLocker document fetch fails
   *
   * @remarks
   * This event is sent when document fetch from DigiLocker fails due to
   * authorization issues, network errors, or document unavailability.
   *
   * Payload includes:
   * - `kycSessionId`: The KYC submission ID (may be null if error occurred early)
   * - `externalUserId`: Client's user identifier
   * - `documentTypes`: Array of document types that were requested
   * - `error`: Error message describing the failure
   *
   * @example
   * ```json
   * {
   *   "id": "evt_dl_fetch_fail_789",
   *   "event": "kyc.digilocker_fetch_failed",
   *   "timestamp": "2026-01-14T10:32:00.000Z",
   *   "data": {
   *     "kycSessionId": "sub_123abc-456def-789ghi",
   *     "externalUserId": "customer-456",
   *     "documentTypes": ["PAN", "AADHAAR"],
   *     "error": "Documents not found in DigiLocker account"
   *   }
   * }
   * ```
   */
  KYC_DIGILOCKER_FETCH_FAILED = 'kyc.digilocker_fetch_failed',
}
