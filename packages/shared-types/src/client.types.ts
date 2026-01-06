/**
 * Client Portal Types
 *
 * TypeScript type definitions for client portal API endpoints.
 * Shared between frontend (Next.js) and backend (NestJS) for type safety.
 *
 * @remarks
 * **Module Purpose**:
 * Provides consistent type definitions for:
 * - Client settings and configuration
 * - Webhook configuration and testing
 * - Webhook delivery logs and monitoring
 *
 * **Usage**:
 * ```typescript
 * import type { ClientSettings, WebhookTestResult } from '@enxtai/shared-types';
 *
 * const settings: ClientSettings = await getClientSettings();
 * const result: WebhookTestResult = await testWebhook();
 * ```
 */

/**
 * Client Settings Response
 *
 * Returned by GET /api/v1/client/settings endpoint.
 * Contains client configuration with sensitive fields masked for security.
 *
 * @remarks
 * **Field Masking**:
 * - `webhookSecret`: Shows '***' if configured, null if not set
 * - `apiKey`: Shows first 10 characters + '...' (e.g., 'client_abc...')
 *
 * **Security Notes**:
 * - Never expose full API key or webhook secret in responses
 * - Client must store full values from initial configuration
 * - Masking prevents accidental leakage in logs or screenshots
 *
 * @property name - Client organization name
 * @property webhookUrl - HTTPS endpoint for webhook delivery (null if not configured)
 * @property webhookSecret - Masked webhook secret ('***' or null)
 * @property apiKey - Masked API key for external API access
 */
export interface ClientSettings {
  name: string;
  webhookUrl: string | null;
  webhookSecret: string | null; // '***' if configured, null if not
  apiKey: string; // Masked: 'client_abc...'
}

/**
 * Webhook Test Result
 *
 * Returned by POST /api/v1/client/webhook/test endpoint.
 * Indicates whether test webhook delivery succeeded and provides diagnostic info.
 *
 * @remarks
 * **Success Scenario**:
 * ```json
 * {
 *   "success": true,
 *   "statusCode": 200,
 *   "responseTime": "245ms"
 * }
 * ```
 *
 * **Failure Scenario**:
 * ```json
 * {
 *   "success": false,
 *   "statusCode": 500,
 *   "responseTime": "1234ms",
 *   "error": "Connection refused"
 * }
 * ```
 *
 * **Timeout Scenario**:
 * ```json
 * {
 *   "success": false,
 *   "responseTime": "10000ms",
 *   "error": "Request timeout after 10s"
 * }
 * ```
 *
 * **Usage**:
 * - `success === true`: Client endpoint responded with 2xx status
 * - `success === false`: Network error, timeout, or non-2xx response
 * - Check `error` field for diagnostic message on failure
 *
 * @property success - Whether webhook delivery succeeded
 * @property statusCode - HTTP status code from client endpoint (undefined if network error)
 * @property responseTime - Time taken for request (e.g., '245ms')
 * @property error - Error message if delivery failed (undefined on success)
 */
export interface WebhookTestResult {
  success: boolean;
  statusCode?: number;
  responseTime?: string; // e.g., '245ms'
  error?: string;
}

/**
 * Webhook Log Entry
 *
 * Represents a single webhook delivery attempt.
 * Displayed in client portal settings page for debugging and monitoring.
 *
 * @remarks
 * **Lifecycle**:
 * 1. KYC status change triggers webhook event
 * 2. WebhookService generates HMAC signature and sends POST request
 * 3. Response (or error) logged to database
 * 4. Retry logic may create additional log entries for same event
 *
 * **Log Fields Explained**:
 * - `id`: Unique log identifier (e.g., 'log_abc123')
 * - `event`: Event type (e.g., 'kyc.verification_completed', 'kyc.test')
 * - `responseStatus`: HTTP status code (200, 500, etc.) or null if network error
 * - `responseBody`: Client endpoint's response body (may be truncated)
 * - `attemptCount`: Number of delivery attempts (1 = success on first try, 2+ = retries)
 * - `createdAt`: ISO 8601 timestamp of delivery attempt
 *
 * **Response Status Interpretation**:
 * - `200-299`: Successful delivery
 * - `400-499`: Client-side error (bad request, not found, etc.)
 * - `500-599`: Server-side error on client endpoint
 * - `null`: Network error (connection refused, timeout, DNS failure)
 *
 * **Retention Policy**:
 * - Standard tier: 30 days
 * - Enterprise tier: 90 days
 * - Automatic cleanup via scheduled job
 *
 * @property id - Unique log identifier
 * @property event - Webhook event type (e.g., 'kyc.verification_completed')
 * @property responseStatus - HTTP status code or null if network error
 * @property responseBody - Client endpoint's response body (may be truncated)
 * @property attemptCount - Number of delivery attempts (1 = first try, 2+ = retries)
 * @property createdAt - ISO 8601 timestamp of delivery attempt
 */
export interface WebhookLog {
  id: string;
  event: string; // e.g., 'kyc.verification_completed'
  responseStatus: number | null; // HTTP status code or null if network error
  responseBody: string | null;
  attemptCount: number;
  createdAt: string; // ISO 8601 timestamp
}

/**
 * Paginated Webhook Logs Response
 *
 * Returned by GET /api/v1/client/webhook/logs endpoint.
 * Provides webhook logs with pagination metadata for efficient browsing.
 *
 * @remarks
 * **Pagination Logic**:
 * - Default page size: 50 logs
 * - Maximum page size: 100 logs
 * - Pages are 1-indexed (first page is page=1, not 0)
 * - Total pages calculated as: Math.ceil(total / limit)
 *
 * **Example Request**:
 * ```
 * GET /api/v1/client/webhook/logs?page=2&limit=50
 * ```
 *
 * **Example Response**:
 * ```json
 * {
 *   "logs": [ ... ],
 *   "total": 234,
 *   "page": 2,
 *   "limit": 50,
 *   "totalPages": 5
 * }
 * ```
 *
 * **Client-Side Pagination**:
 * ```typescript
 * const [page, setPage] = useState(1);
 * const { logs, totalPages } = await getWebhookLogs(page, 50);
 *
 * // Next page
 * setPage(page => Math.min(page + 1, totalPages));
 *
 * // Previous page
 * setPage(page => Math.max(page - 1, 1));
 * ```
 *
 * @property logs - Array of webhook log entries for current page
 * @property total - Total number of logs across all pages
 * @property page - Current page number (1-indexed)
 * @property limit - Number of logs per page
 * @property totalPages - Total number of pages available
 */
export interface WebhookLogsResponse {
  logs: WebhookLog[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Client Dashboard Statistics
 * 
 * Aggregated KYC submission metrics for client dashboard.
 * 
 * @remarks
 * **Calculation**:
 * - Counts grouped by internalStatus
 * - Rejection rate calculated as (rejected / total * 100)
 * - Cached for 5 minutes (future enhancement)
 * 
 * **Usage**: Dashboard cards and metrics visualization
 * 
 * @property totalSubmissions - Total count of all KYC submissions
 * @property verifiedCount - Count of VERIFIED submissions
 * @property pendingReviewCount - Count of PENDING_REVIEW submissions
 * @property rejectedCount - Count of REJECTED submissions
 * @property rejectionRate - Percentage of rejected submissions (0-100)
 */
export interface ClientStats {
  totalSubmissions: number;
  verifiedCount: number;
  pendingReviewCount: number;
  rejectedCount: number;
  rejectionRate: number; // Percentage (0-100)
}

/**
 * Client Submission List Item
 * 
 * Lightweight submission data for table display.
 * 
 * @remarks
 * **Purpose**: Optimized for list views with minimal data transfer
 * **Fields**: Only essential data for table rendering
 * **Security**: No sensitive document URLs (presigned URLs only in detail view)
 * 
 * @property id - Unique submission identifier
 * @property externalUserId - Client's user ID
 * @property email - User email address
 * @property phone - User phone number
 * @property internalStatus - Current internal status (VERIFIED, PENDING_REVIEW, etc.)
 * @property finalStatus - User-facing status
 * @property faceMatchScore - Face match confidence (0-1), null if not yet verified
 * @property livenessScore - Liveness detection confidence (0-1), null if not yet verified
 * @property submissionDate - ISO 8601 timestamp when submission was created
 * @property updatedAt - ISO 8601 timestamp of last update
 */
export interface ClientSubmissionListItem {
  id: string;
  externalUserId: string; // Client's user ID
  email: string;
  phone: string;
  internalStatus: string;
  finalStatus: string;
  faceMatchScore: number | null;
  livenessScore: number | null;
  submissionDate: string; // ISO 8601
  updatedAt: string; // ISO 8601
}

/**
 * Paginated Submissions Response
 * 
 * Response format for GET /api/v1/client/submissions endpoint.
 * 
 * @remarks
 * **Pagination**: 1-indexed pages, configurable limit (max 100)
 * **Filtering**: Supports status, search, date range filters
 * **Sorting**: Default order by submissionDate DESC
 * 
 * @property submissions - Array of submission list items for current page
 * @property total - Total count of submissions matching filters
 * @property page - Current page number (1-indexed)
 * @property limit - Number of items per page
 * @property totalPages - Total number of pages available
 */
export interface ClientSubmissionsResponse {
  submissions: ClientSubmissionListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

/**
 * Client Submission Detail
 * 
 * Full submission data with presigned document URLs.
 * 
 * @remarks
 * **Purpose**: Complete submission data for detail view
 * **Presigned URLs**: Valid for 1 hour, regenerate on page refresh
 * **Security**: Aadhaar number masked (shows last 4 digits)
 * 
 * @property id - Unique submission identifier
 * @property externalUserId - Client's user ID
 * @property email - User email address
 * @property phone - User phone number
 * @property internalStatus - Current internal status
 * @property finalStatus - User-facing status
 * @property submissionDate - ISO 8601 timestamp when submission was created
 * @property updatedAt - ISO 8601 timestamp of last update
 * @property panNumber - PAN number extracted from document
 * @property aadhaarNumber - Aadhaar number (masked, last 4 digits visible)
 * @property fullName - Full name extracted from documents
 * @property dateOfBirth - Date of birth as ISO date string (YYYY-MM-DD)
 * @property fathersName - Father's name from Aadhaar
 * @property gender - Gender from Aadhaar
 * @property address - Address string extracted from Aadhaar
 * @property faceMatchScore - Face match confidence (0-1)
 * @property livenessScore - Liveness detection confidence (0-1)
 * @property documentQuality - Document quality score (0-1)
 * @property rejectionReason - Reason for rejection (null if not rejected)
 * @property presignedUrls - Object containing presigned URLs for document viewing (1hr expiry)
 */
export interface ClientSubmissionDetail {
  id: string;
  externalUserId: string;
  email: string;
  phone: string;
  internalStatus: string;
  finalStatus: string;
  submissionDate: string;
  updatedAt: string;
  
  // Extracted Data
  panNumber: string | null;
  aadhaarNumber: string | null; // Masked
  fullName: string | null;
  dateOfBirth: string | null; // ISO date string
  fathersName: string | null;
  gender: string | null;
  address: string | null;
  
  // Verification Scores
  faceMatchScore: number | null;
  livenessScore: number | null;
  documentQuality: number | null;
  
  // Rejection Info
  rejectionReason: string | null;
  
  // Presigned URLs (valid for 1 hour)
  presignedUrls: {
    panDocument?: string;
    aadhaarFront?: string;
    aadhaarBack?: string;
    livePhoto?: string;
    signature?: string;
  };
}
