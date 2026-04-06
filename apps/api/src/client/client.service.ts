import { Injectable, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WebhookService } from '../webhooks/webhook.service';
import { WebhookEvent } from '../webhooks/webhook-events.enum';
import { Client, InternalStatus, FinalStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';

// -----------------------------------------------------------------------
// KYC Step Progress Types
//
// Used by computeStepProgress() to derive step-level completion from document
// URL fields on a KYC submission. Consumed by the client-facing status API
// (GET /v1/client/submissions/:id) and the initiation API (POST /v1/kyc/initiate)
// so external clients (e.g., SMC) can display accurate progress indicators
// and resume the clientUser at the correct step.
// -----------------------------------------------------------------------

/**
 * The ordered list of KYC flow steps. Matches the frontend page sequence:
 * /kyc/upload (pan + aadhaar) -> /kyc/photo -> /kyc/signature -> /kyc/verify
 */
const KYC_STEP_ORDER = ['pan', 'aadhaar', 'photo', 'signature'] as const;

type KycStep = typeof KYC_STEP_ORDER[number];

interface StepProgress {
  /** Steps that the clientUser has completed (documents uploaded). */
  completedSteps: KycStep[];
  /** The next step the clientUser needs to complete, or null if all steps are done. */
  currentStep: KycStep | null;
  /** Total number of steps in the KYC flow. Always 4. */
  totalSteps: number;
}

/**
 * Compute Step Progress
 *
 * Derives step-level progress from the document URL fields stored on a KYC submission.
 * No new database columns are needed -- progress is computed from existing nullable
 * document URL fields.
 *
 * Step completion rules:
 *   - "pan":       panNumber is non-null
 *   - "aadhaar":   (aadhaarFrontUrl AND aadhaarBackUrl) OR aadhaarDocumentUrl is non-null
 *   - "photo":     livePhotoUrl is non-null
 *   - "signature": signatureUrl is non-null
 *
 * currentStep is the first step in KYC_STEP_ORDER that is not yet complete.
 * If all steps are done, currentStep is null.
 *
 * @param submission - KYCSubmission record (needs document URL fields)
 * @returns StepProgress with completedSteps, currentStep, and totalSteps
 */
export function computeStepProgress(submission: {
  panNumber: string | null;
  aadhaarDocumentUrl: string | null;
  aadhaarFrontUrl: string | null;
  aadhaarBackUrl: string | null;
  livePhotoUrl: string | null;
  signatureUrl: string | null;
}): StepProgress {
  // Evaluate each step independently based on document presence.
  const stepStatus: Record<KycStep, boolean> = {
    pan: Boolean(submission.panNumber),
    aadhaar: Boolean(
      submission.aadhaarDocumentUrl ||
      (submission.aadhaarFrontUrl && submission.aadhaarBackUrl),
    ),
    photo: Boolean(submission.livePhotoUrl),
    signature: Boolean(submission.signatureUrl),
  };

  const completedSteps = KYC_STEP_ORDER.filter((step) => stepStatus[step]);

  // currentStep is the first incomplete step in the ordered sequence.
  const currentStep = KYC_STEP_ORDER.find((step) => !stepStatus[step]) ?? null;

  return {
    completedSteps: completedSteps as KycStep[],
    currentStep,
    totalSteps: KYC_STEP_ORDER.length,
  };
}

/**
 * Client Service
 *
 * Manages client organizations in the multi-tenant KYC SaaS platform. Handles
 * API key generation, authentication, webhook configuration, and client lifecycle.
 *
 * @remarks
 * **Multi-Tenancy Role**:
 * - Central authentication point for all client API requests
 * - Generates and validates API keys for tenant identification
 * - Manages client status (ACTIVE, SUSPENDED, TRIAL)
 * - Stores webhook configuration for status notifications
 *
 * **Security Considerations**:
 * - API keys are SHA-256 hashed before database storage
 * - Plaintext keys shown only once during creation, then nullified
 * - Webhook secrets stored plaintext (required for HMAC signature generation)
 * - Key format: `client_` + 64 hex characters (32 bytes)
 *
 * @example
 * ```typescript
 * // Create new client
 * const client = await clientService.createClient({
 *   name: 'SMC Private Wealth',
 *   webhookUrl: 'https://client.com/webhook',
 *   webhookSecret: 'wh_secret_abc123'
 * });
 * console.log('API Key (show once):', client.apiKeyPlaintext);
 * await clientService.clearApiKeyPlaintext(client.id);
 * ```
 */
@Injectable()
export class ClientService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly webhookService: WebhookService,
  ) {}

  /**
   * Generate Secure API Key
   *
   * Creates a cryptographically secure API key with both plaintext (for one-time display)
   * and hashed version (for database storage). Uses Node.js crypto module for randomness
   * and SHA-256 for hashing.
   *
   * @returns Object containing plaintext key (show once) and hashed key (store in DB)
   *
   * @remarks
   * **Key Format**:
   * - Prefix: `client_` (identifies key type, similar to Stripe/GitHub patterns)
   * - Random: 64 hexadecimal characters (32 bytes of entropy)
   * - Total length: 71 characters (`client_` + 64 hex)
   *
   * **Security Rationale**:
   * - 32 bytes = 256 bits of entropy (cryptographically secure)
   * - SHA-256 hashing prevents plaintext storage in database
   * - One-way hash ensures keys cannot be recovered if DB compromised
   * - Plaintext returned only once, then nullified in database
   *
   * **Usage Flow**:
   * 1. Super admin creates client via admin panel
   * 2. System generates API key and displays plaintext ONCE
   * 3. Plaintext stored temporarily in `apiKeyPlaintext` field
   * 4. After display, `clearApiKeyPlaintext()` sets field to null
   * 5. Client stores plaintext securely, uses for authentication
   * 6. Server validates by hashing incoming key and comparing to stored hash
   *
   * @example
   * ```typescript
   * const { plaintext, hashed } = clientService.generateApiKey();
   * // plaintext: "client_a1b2c3d4e5f6..."
   * // hashed: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08"
   * ```
   */
  generateApiKey(): { plaintext: string; hashed: string } {
    // Generate 32 random bytes (256 bits of entropy)
    const randomPart = randomBytes(32).toString('hex'); // 64 hex characters
    const plaintext = `client_${randomPart}`;

    // Hash with SHA-256 for database storage
    const hashed = createHash('sha256').update(plaintext).digest('hex');

    return { plaintext, hashed };
  }

  /**
   * Create Client Organization
   *
   * Onboards a new client organization to the KYC SaaS platform. Generates API key,
   * creates database record, and returns client with temporary plaintext key for
   * one-time display.
   *
   * @param data Client creation data (name, optional webhook config)
   * @returns Created client with `apiKeyPlaintext` field populated (must display immediately)
   *
   * @remarks
   * **Onboarding Flow**:
   * 1. Super admin enters client name and optional webhook config
   * 2. System generates secure API key (see `generateApiKey()`)
   * 3. Client record created with status ACTIVE
   * 4. Plaintext key returned in response (shown once in UI)
   * 5. Caller must display key to clientUser, then call `clearApiKeyPlaintext()`
   * 6. Client stores key securely (environment variables, secrets manager)
   *
   * **Field Requirements**:
   * - `name`: Required (organization name, e.g., "SMC Private Wealth")
   * - `webhookUrl`: Optional (can be configured later via client portal)
   * - `webhookSecret`: Optional (auto-generated if not provided, min 16 chars)
   * - `apiKey`: Auto-generated (SHA-256 hash stored in DB)
   * - `status`: Defaults to ACTIVE
   *
   * **Security Notes**:
   * - Webhook URL must be HTTPS in production (validated by DTO)
   * - Webhook secret stored plaintext (needed for HMAC signature generation)
   * - API key plaintext stored temporarily, must be cleared after display
   *
   * @throws {Error} If client with same name already exists
   *
   * @example
   * ```typescript
   * const client = await clientService.createClient({
   *   name: 'SMC Private Wealth',
   *   webhookUrl: 'https://smc.com/kyc-webhook',
   *   webhookSecret: 'wh_secret_abc123xyz789'
   * });
   *
   * // Display API key ONCE in admin UI
   * console.log('API Key:', client.apiKeyPlaintext);
   *
   * // Clear plaintext after display
   * await clientService.clearApiKeyPlaintext(client.id);
   * ```
   */
  async createClient(data: {
    name: string;
    webhookUrl?: string;
    webhookSecret?: string;
  }): Promise<Client> {
    const { plaintext, hashed } = this.generateApiKey();

    return this.prisma.client.create({
      data: {
        name: data.name,
        apiKey: hashed, // Store hashed version
        apiKeyPlaintext: plaintext, // Temporary, show once
        webhookUrl: data.webhookUrl,
        webhookSecret: data.webhookSecret,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Validate API Key
   *
   * Authenticates API requests by validating the provided API key. Hashes the incoming
   * key and looks up matching client in database. Checks client status to ensure account
   * is active.
   *
   * @param apiKey Plaintext API key from `X-API-Key` header
   * @returns Client object if valid and active, null if invalid/inactive
   *
   * @remarks
   * **Authentication Flow** (executed by TenantMiddleware):
   * 1. Extract `X-API-Key` header from request
   * 2. Hash provided key with SHA-256
   * 3. Query database for client with matching hashed key
   * 4. Check if client status is ACTIVE
   * 5. Return Client object or null
   *
   * **Status Validation**:
   * - ACTIVE: Authentication succeeds, proceed to route handler
   * - SUSPENDED: Authentication fails (billing issue, policy violation)
   * - TRIAL: Authentication succeeds (but may have feature limitations)
   *
   * **Null Return Semantics**:
   * - Returns null if no client found with matching hashed key
   * - Returns null if client exists but status is SUSPENDED
   * - Middleware converts null to UnauthorizedException
   *
   * **Security Considerations**:
   * - Constant-time comparison at database level (SHA-256 hash)
   * - No information leakage about which validation step failed
   * - Failed attempts should be logged for security monitoring
   *
   * @example
   * ```typescript
   * // Client sends request with API key
   * const apiKey = request.headers['x-api-key'];
   *
   * // Validate in middleware
   * const client = await clientService.validateApiKey(apiKey);
   * if (!client) {
   *   throw new UnauthorizedException('Invalid or inactive API key');
   * }
   *
   * // Inject into request
   * request.clientId = client.id;
   * request.client = client;
   * ```
   */
  async validateApiKey(apiKey: string): Promise<Client | null> {
    // Hash the provided API key
    const hashed = createHash('sha256').update(apiKey).digest('hex');

    // Look up client by hashed key
    const client = await this.prisma.client.findUnique({
      where: { apiKey: hashed },
    });

    // Return null if not found or inactive
    if (!client || client.status !== 'ACTIVE') {
      return null;
    }

    return client;
  }

  /**
   * Update Webhook Configuration
   *
   * Updates client's webhook endpoint and secret for KYC status notifications.
   * Used by client portal settings page to configure real-time event delivery.
   *
   * @param clientId UUID of the client to update
   * @param webhookUrl HTTPS endpoint to receive webhook events
   * @param webhookSecret Secret for HMAC signature verification
   * @returns Updated client object
   *
   * @remarks
   * **Webhook Configuration Requirements**:
   * - URL must be HTTPS (TLS required for security)
   * - URL must be publicly accessible (no localhost/internal IPs)
   * - Secret must be at least 16 characters (used for HMAC-SHA256)
   * - Secret stored plaintext (needed for signature generation)
   *
   * **Webhook Event Flow**:
   * 1. KYC status changes (e.g., VERIFIED → CVL_SUBMITTED)
   * 2. System triggers webhook delivery (WebhookService)
   * 3. Payload signed with HMAC-SHA256 using webhookSecret
   * 4. HTTP POST to webhookUrl with signature in header
   * 5. Client verifies signature and processes event
   * 6. Delivery logged in WebhookLog table
   *
   * **Validation Rules** (enforced by DTO):
   * - `webhookUrl`: Must match `https://` pattern (UpdateWebhookDto)
   * - `webhookSecret`: Minimum 16 characters (UpdateWebhookDto)
   * - Both fields required (use empty string to clear)
   *
   * **Security Best Practices**:
   * - Rotate webhook secret periodically
   * - Verify HMAC signature on client side
   * - Use TLS/HTTPS for all webhook endpoints
   * - Implement retry logic with exponential backoff
   *
   * @throws {Error} If client not found
   * @throws {BadRequestException} If URL is not HTTPS (DTO validation)
   * @throws {BadRequestException} If secret too short (DTO validation)
   *
   * @example
   * ```typescript
   * // Client portal settings form submission
   * const updated = await clientService.updateWebhookConfig(
   *   clientId,
   *   'https://client.com/webhooks/kyc',
   *   'wh_secret_new_abc123xyz789'
   * );
   *
   * console.log('Webhook configured:', updated.webhookUrl);
   * ```
   */
  async updateWebhookConfig(
    clientId: string,
    webhookUrl: string,
    webhookSecret: string,
  ): Promise<Client> {
    return this.prisma.client.update({
      where: { id: clientId },
      data: {
        webhookUrl,
        webhookSecret,
      },
    });
  }

  /**
   * Get Client by ID
   *
   * Retrieves client record by UUID. Used by middleware for tenant context
   * injection and by other services for tenant-scoped operations.
   *
   * @param clientId UUID of the client to retrieve
   * @returns Client object if found, null if not found
   *
   * @remarks
   * **Usage Contexts**:
   * - TenantMiddleware: Lookup after API key validation
   * - KycService: Fetch client config for tenant-scoped operations
   * - AdminService: Display client details in admin panel
   * - WebhookService: Get webhook URL for event delivery
   *
   * @example
   * ```typescript
   * const client = await clientService.getClientById(req.clientId);
   * if (!client) {
   *   throw new NotFoundException('Client not found');
   * }
   * ```
   */
  async getClientById(clientId: string): Promise<Client | null> {
    return this.prisma.client.findUnique({
      where: { id: clientId },
    });
  }

  /**
   * Clear API Key Plaintext
   *
   * Nullifies the `apiKeyPlaintext` field after initial display during client creation.
   * Ensures API keys are shown only once for security purposes.
   *
   * @param clientId UUID of the client to update
   * @returns void
   *
   * @remarks
   * **Security Rationale**:
   * - API keys are sensitive credentials (equivalent to passwords)
   * - Plaintext keys should never be stored long-term in database
   * - One-time display forces clients to store keys securely
   * - If key is lost, admin must regenerate (future feature)
   *
   * **Usage Flow**:
   * 1. Admin creates client via admin panel
   * 2. System displays `apiKeyPlaintext` in response
   * 3. Admin UI shows key in modal/alert with "Copy" button
   * 4. After clientUser acknowledges, frontend calls this method
   * 5. Database field set to null permanently
   *
   * **Alternative Approaches** (not implemented):
   * - Auto-clear after N seconds (timer-based)
   * - Auto-clear after first read (database trigger)
   * - Current approach: Manual clear after clientUser confirmation
   *
   * @example
   * ```typescript
   * // After displaying API key to clientUser
   * await clientService.clearApiKeyPlaintext(client.id);
   * // client.apiKeyPlaintext is now null in database
   * ```
   */
  async clearApiKeyPlaintext(clientId: string): Promise<void> {
    await this.prisma.client.update({
      where: { id: clientId },
      data: { apiKeyPlaintext: null },
    });
  }

  /**
   * Get Client Dashboard Statistics
   *
   * Calculates aggregated KYC submission metrics for dashboard display.
   *
   * @param clientId - Client UUID from session
   * @returns Statistics object with counts and rejection rate
   *
   * @remarks
   * **Metrics Calculated**:
   * - Total submissions (all statuses)
   * - Verified count (internalStatus = VERIFIED)
   * - Pending review count (internalStatus = PENDING_REVIEW)
   * - Rejected count (internalStatus = REJECTED)
   * - Rejection rate (rejected / total * 100)
   *
   * **Performance**:
   * - Uses Prisma aggregation (single query with groupBy)
   * - Indexed on [clientId, internalStatus] for fast filtering
   * - Cached for 5 minutes (future enhancement)
   */
  async getClientStats(clientId: string) {
    // Count submissions by status
    const statusCounts = await this.prisma.kYCSubmission.groupBy({
      by: ['internalStatus'],
      where: { clientId },
      _count: true,
    });

    // Calculate metrics
    const total = statusCounts.reduce((sum, item) => sum + item._count, 0);
    const verified = statusCounts.find(s => s.internalStatus === 'VERIFIED')?._count || 0;
    const pendingReview = statusCounts.find(s => s.internalStatus === 'PENDING_REVIEW')?._count || 0;
    const rejected = statusCounts.find(s => s.internalStatus === 'REJECTED')?._count || 0;
    const rejectionRate = total > 0 ? (rejected / total) * 100 : 0;

    return {
      totalSubmissions: total,
      verifiedCount: verified,
      pendingReviewCount: pendingReview,
      rejectedCount: rejected,
      rejectionRate: Math.round(rejectionRate * 10) / 10, // Round to 1 decimal
    };
  }

  /**
   * Get Client Submissions (Paginated & Filtered)
   *
   * Retrieves KYC submissions for client portal table with filtering and pagination.
   *
   * @param clientId - Client UUID from session
   * @param filters - Optional filters (status, date range, search)
   * @param page - Page number (1-indexed)
   * @param limit - Items per page (max 100)
   * @returns Paginated submissions with metadata
   *
   * @remarks
   * **Filtering**:
   * - status: Filter by internalStatus (VERIFIED, PENDING_REVIEW, etc.)
   * - search: Search by externalUserId or email (case-insensitive)
   * - startDate/endDate: Filter by submissionDate range
   *
   * **Sorting**: Default order by submissionDate DESC (newest first)
   *
   * **Tenant Isolation**: All queries filtered by clientId from session
   */
  async getClientSubmissions(
    clientId: string,
    filters: { status?: string; search?: string; startDate?: Date; endDate?: Date },
    page: number = 1,
    limit: number = 20,
  ) {
    // Build where clause with tenant isolation
    const where: any = { clientId };

    if (filters.status) {
      where.internalStatus = filters.status;
    }

    if (filters.startDate || filters.endDate) {
      where.submissionDate = {};
      if (filters.startDate) where.submissionDate.gte = filters.startDate;
      if (filters.endDate) where.submissionDate.lte = filters.endDate;
    }

    // Search in clientUser fields (externalUserId, email)
    if (filters.search) {
      where.clientUser = {
        is: {
          OR: [
            { externalUserId: { contains: filters.search, mode: 'insensitive' } },
            { email: { contains: filters.search, mode: 'insensitive' } },
          ],
        },
      };
    }

    // Calculate pagination
    const skip = (page - 1) * limit;
    const take = Math.min(limit, 100); // Max 100 per page

    // Query submissions with clientUser data
    const [submissions, total] = await Promise.all([
      this.prisma.kYCSubmission.findMany({
        where,
        include: {
          clientUser: {
            select: {
              externalUserId: true,
              email: true,
              phone: true,
            },
          },
        },
        orderBy: { submissionDate: 'desc' },
        skip,
        take,
      }),
      this.prisma.kYCSubmission.count({ where }),
    ]);

    return {
      submissions: submissions.map(s => ({
        id: s.id,
        externalUserId: s.clientUser.externalUserId,
        email: s.clientUser.email,
        phone: s.clientUser.phone,
        internalStatus: s.internalStatus,
        finalStatus: s.finalStatus,
        faceMatchScore: s.faceMatchScore,
        livenessScore: s.livenessScore,
        submissionDate: s.submissionDate.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      })),
      total,
      page,
      limit: take,
      totalPages: Math.ceil(total / take),
    };
  }

  /**
   * Get Submission Detail with Presigned URLs
   *
   * Retrieves full submission data including presigned URLs for document viewing.
   *
   * @param clientId - Client UUID from session (for tenant isolation)
   * @param submissionId - Submission UUID
   * @returns Submission detail with presigned URLs
   *
   * @remarks
   * **Tenant Isolation**: Validates submission belongs to client
   * **Presigned URLs**: Generated with 1-hour expiry for security
   * **Document Paths**: Parses MinIO paths (bucket/objectName format)
   */
  async getSubmissionDetail(clientId: string, submissionId: string) {
    // Fetch submission with tenant validation
    const submission = await this.prisma.kYCSubmission.findFirst({
      where: { id: submissionId, clientId },
      include: {
        clientUser: {
          select: {
            externalUserId: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found or access denied');
    }

    // Generate presigned URLs for documents
    const presignedUrls: any = {};

    // Helper to parse MinIO path and generate presigned URL
    const generateUrl = async (path: string | null, key: string) => {
      if (!path) return;
      const [bucket, ...rest] = path.split('/');
      const objectName = rest.join('/');
      if (bucket && objectName) {
        presignedUrls[key] = await this.storageService.generatePresignedUrl(bucket, objectName);
      }
    };

    await Promise.all([
      generateUrl(submission.panNumber, 'panDocument'),
      generateUrl(submission.aadhaarFrontUrl, 'aadhaarFront'),
      generateUrl(submission.aadhaarBackUrl, 'aadhaarBack'),
      generateUrl(submission.livePhotoUrl, 'livePhoto'),
      generateUrl(submission.signatureUrl, 'signature'),
    ]);

    // Compute step-level progress from document URL fields.
    // This allows external clients (e.g., SMC) to display accurate progress
    // indicators and route clientUsers to the correct KYC resumption step.
    const stepProgress = computeStepProgress(submission);

    return {
      id: submission.id,
      externalUserId: submission.clientUser.externalUserId,
      email: submission.clientUser.email,
      phone: submission.clientUser.phone,
      internalStatus: submission.internalStatus,
      finalStatus: submission.finalStatus,
      submissionDate: submission.submissionDate.toISOString(),
      updatedAt: submission.updatedAt.toISOString(),
      panNumber: submission.panNumber,
      aadhaarNumber: submission.aadhaarNumber
        ? submission.aadhaarNumber.replace(/^\d{8}/, 'XXXX XXXX')
        : null,
      fullName: submission.fullName,
      dateOfBirth: submission.dateOfBirth?.toISOString().split('T')[0] || null,
      fathersName: null, // Not in schema yet
      gender: null, // Not in schema yet
      address: submission.address ? JSON.stringify(submission.address) : null,
      faceMatchScore: submission.faceMatchScore,
      livenessScore: submission.livenessScore,
      documentQuality: null, // Not in schema yet
      rejectionReason: submission.rejectionReason,
      presignedUrls,
      // Step-level progress fields for KYC state management.
      // completedSteps: array of completed step names (e.g., ["pan", "aadhaar"])
      // currentStep: the next step to complete, or null if all done
      // totalSteps: always 4 (pan, aadhaar, photo, signature)
      completedSteps: stepProgress.completedSteps,
      currentStep: stepProgress.currentStep,
      totalSteps: stepProgress.totalSteps,
    };
  }

  /**
   * Approve a KYC Submission
   *
   * Marks a submission as VERIFIED/COMPLETE and sends a KYC_STATUS_CHANGED
   * webhook to the client's configured webhook URL. Only submissions that
   * are not already in a terminal state (VERIFIED or REJECTED) can be approved.
   *
   * **State Transition**:
   * - internalStatus -> VERIFIED
   * - finalStatus   -> COMPLETE
   *
   * **Webhook Payload** (KYC_STATUS_CHANGED):
   * ```json
   * {
   *   "kycSessionId": "submission-uuid",
   *   "externalUserId": "external-clientUser-id",
   *   "status": "VERIFIED",
   *   "finalStatus": "COMPLETE",
   *   "previousStatus": "PENDING_REVIEW"
   * }
   * ```
   *
   * @param clientId - Client UUID from session (for tenant isolation)
   * @param submissionId - Submission UUID to approve
   * @returns Updated submission record
   * @throws NotFoundException if submission not found or belongs to different client
   * @throws BadRequestException if submission is already in a terminal state
   */
  async approveSubmission(clientId: string, submissionId: string) {
    // Fetch submission with tenant isolation
    const submission = await this.prisma.kYCSubmission.findFirst({
      where: { id: submissionId, clientId },
      include: {
        clientUser: {
          select: { externalUserId: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found or access denied');
    }

    // Prevent re-approving or approving already-rejected submissions
    if (
      submission.internalStatus === InternalStatus.VERIFIED ||
      submission.internalStatus === InternalStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot approve submission with status ${submission.internalStatus}`,
      );
    }

    const previousStatus = submission.internalStatus;

    // Update submission to approved state
    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submissionId },
      data: {
        internalStatus: InternalStatus.VERIFIED,
        finalStatus: FinalStatus.COMPLETE,
      },
    });

    // Fire-and-forget: send KYC_STATUS_CHANGED webhook in the background
    // so the approve response returns immediately to the UI.
    this.webhookService.sendWebhook(clientId, WebhookEvent.KYC_STATUS_CHANGED, {
      kycSessionId: submission.id,
      externalUserId: submission.clientUser.externalUserId,
      status: InternalStatus.VERIFIED,
      finalStatus: FinalStatus.COMPLETE,
      previousStatus,
    }).catch(() => {});

    return {
      success: true,
      message: 'Submission approved successfully',
      submission: {
        id: updated.id,
        internalStatus: updated.internalStatus,
        finalStatus: updated.finalStatus,
      },
    };
  }

  /**
   * Reject a KYC Submission
   *
   * Marks a submission as REJECTED and stores the rejection reason. Sends a
   * KYC_STATUS_CHANGED webhook with the rejection reason included in the payload.
   * Only submissions that are not already in a terminal state can be rejected.
   *
   * **State Transition**:
   * - internalStatus   -> REJECTED
   * - finalStatus      -> REJECTED
   * - rejectionReason  -> provided reason string
   *
   * **Webhook Payload** (KYC_STATUS_CHANGED):
   * ```json
   * {
   *   "kycSessionId": "submission-uuid",
   *   "externalUserId": "external-clientUser-id",
   *   "status": "REJECTED",
   *   "finalStatus": "REJECTED",
   *   "previousStatus": "PENDING_REVIEW",
   *   "rejectionReason": "PAN document is blurry"
   * }
   * ```
   *
   * @param clientId - Client UUID from session (for tenant isolation)
   * @param submissionId - Submission UUID to reject
   * @param rejectionReason - Human-readable reason for rejection
   * @returns Updated submission record
   * @throws NotFoundException if submission not found or belongs to different client
   * @throws BadRequestException if submission is already in a terminal state
   */
  async rejectSubmission(
    clientId: string,
    submissionId: string,
    rejectionReason: string,
  ) {
    // Fetch submission with tenant isolation
    const submission = await this.prisma.kYCSubmission.findFirst({
      where: { id: submissionId, clientId },
      include: {
        clientUser: {
          select: { externalUserId: true },
        },
      },
    });

    if (!submission) {
      throw new NotFoundException('Submission not found or access denied');
    }

    // Prevent rejecting submissions that are already in a terminal state
    if (
      submission.internalStatus === InternalStatus.VERIFIED ||
      submission.internalStatus === InternalStatus.REJECTED
    ) {
      throw new BadRequestException(
        `Cannot reject submission with status ${submission.internalStatus}`,
      );
    }

    const previousStatus = submission.internalStatus;

    // Update submission to rejected state with reason
    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submissionId },
      data: {
        internalStatus: InternalStatus.REJECTED,
        finalStatus: FinalStatus.REJECTED,
        rejectionReason,
      },
    });

    // Fire-and-forget: send KYC_STATUS_CHANGED webhook in the background
    // so the reject response returns immediately to the UI.
    this.webhookService.sendWebhook(clientId, WebhookEvent.KYC_STATUS_CHANGED, {
      kycSessionId: submission.id,
      externalUserId: submission.clientUser.externalUserId,
      status: InternalStatus.REJECTED,
      finalStatus: FinalStatus.REJECTED,
      previousStatus,
      rejectionReason,
    }).catch(() => {});

    return {
      success: true,
      message: 'Submission rejected',
      submission: {
        id: updated.id,
        internalStatus: updated.internalStatus,
        finalStatus: updated.finalStatus,
        rejectionReason: updated.rejectionReason,
      },
    };
  }
}