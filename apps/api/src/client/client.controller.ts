import {
  Controller,
  Get,
  Put,
  Post,
  Body,
  Req,
  Query,
  BadRequestException,
  UseGuards,
  Param,
} from '@nestjs/common';
import { ClientService } from './client.service';
import { WebhookService } from '../webhooks/webhook.service';
import { UpdateWebhookDto } from './dto/update-webhook.dto';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { ClientThrottlerGuard } from '../common/guards/client-throttler.guard';
import { WebhookEvent } from '../webhooks/webhook-events.enum';
import { randomUUID } from 'crypto';
import { AuthService } from '../auth/auth.service';
import { ForgotPasswordDto } from '../auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';

/**
 * Client Controller
 *
 * Handles client portal API endpoints for authenticated client users.
 *
 * @remarks
 * **Purpose**:
 * Provides REST API endpoints for client portal functionality including:
 * - Webhook configuration management
 * - Webhook endpoint testing
 * - Webhook delivery log viewing
 * - Client settings retrieval
 *
 * **Authentication**:
 * - Uses NextAuth session-based authentication
 * - Bearer token from Authorization header (base64-encoded session data)
 * - Token contains: userId, clientId, role, email
 * - TenantMiddleware NOT applied (uses session auth instead of API keys)
 *
 * **Tenant Isolation**:
 * - clientId extracted from session token
 * - All operations scoped to authenticated client
 * - Cross-tenant access prevented by session validation
 *
 * **Rate Limiting**:
 * - Protected by ClientThrottlerGuard
 * - Limit: 100 requests per minute per client
 * - Prevents abuse of webhook testing endpoint
 *
 * **Security Considerations**:
 * - API key masked in responses (first 10 chars + '...')
 * - Webhook secret masked as '***' when configured
 * - HTTPS required for webhook URLs (enforced by DTO)
 * - 16+ character minimum for webhook secrets
 */
@UseGuards(SessionAuthGuard, ClientThrottlerGuard)
@Controller('v1/client')
export class ClientController {
  constructor(
    private readonly clientService: ClientService,
    private readonly webhookService: WebhookService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Get Client Settings
   *
   * Retrieves current client configuration including webhook settings and API key.
   *
   * @remarks
   * **Endpoint**: GET /api/v1/client/settings
   *
   * **Authentication**: Requires valid NextAuth session token
   *
   * **Response Format**:
   * ```json
   * {
   *   "name": "Acme Corp",
   *   "webhookUrl": "https://acme.com/webhooks/kyc",
   *   "webhookSecret": "***",
   *   "apiKey": "client_abc..."
   * }
   * ```
   *
   * **Field Masking**:
   * - `webhookSecret`: Returns '***' if configured, null if not set
   * - `apiKey`: Shows first 10 characters + '...' for security
   *
   * **Error Scenarios**:
   * - 401 Unauthorized: Invalid or expired session token
   * - 404 Not Found: Client record not found in database
   *
   * @param req - Request object with clientId injected by auth guard/middleware
   * @returns Client settings with masked sensitive fields
   */
  @Get('settings')
  async getSettings(@Req() req: any) {
    // Extract clientId from session token (injected by SessionAuthGuard or middleware)
    const clientId = req.user?.clientId || req.clientId;

    if (!clientId) {
      throw new BadRequestException('Client ID not found in session');
    }

    // Fetch client record
    const client = await this.clientService.getClientById(clientId);

    if (!client) {
      throw new BadRequestException('Client not found');
    }

    // Return sanitized response with masked sensitive fields
    return {
      name: client.name,
      webhookUrl: client.webhookUrl,
      webhookSecret: client.webhookSecret ? '***' : null,
      apiKey: client.apiKey.substring(0, 10) + '...',
    };
  }

  /**
   * Update Webhook Configuration
   *
   * Updates client's webhook endpoint URL and secret for KYC status notifications.
   *
   * @remarks
   * **Endpoint**: PUT /api/v1/client/webhook
   *
   * **Request Body**:
   * ```json
   * {
   *   "webhookUrl": "https://your-domain.com/api/webhooks/kyc",
   *   "webhookSecret": "wh_secret_abc123xyz..."
   * }
   * ```
   *
   * **Validation Rules** (enforced by UpdateWebhookDto):
   * - URL must use HTTPS protocol (HTTP rejected)
   * - URL must be valid format (checked by @IsUrl decorator)
   * - Secret must be at least 16 characters (@MinLength(16))
   * - Secret required for HMAC signature verification
   *
   * **Response Format**:
   * ```json
   * {
   *   "success": true,
   *   "webhookUrl": "https://your-domain.com/api/webhooks/kyc"
   * }
   * ```
   *
   * **Error Scenarios**:
   * - 400 Bad Request: Invalid URL format or secret too short
   * - 401 Unauthorized: Invalid session token
   * - 500 Internal Server Error: Database update failed
   *
   * **Security Notes**:
   * - Secret stored encrypted in database
   * - Used to generate HMAC-SHA256 signatures on webhook payloads
   * - Client should verify signatures to prevent spoofing
   *
   * @param req - Request object with clientId from session
   * @param dto - Validated webhook configuration DTO
   * @returns Success response with configured URL
   */
  @Put('webhook')
  async updateWebhook(@Req() req: any, @Body() dto: UpdateWebhookDto) {
    const clientId = req.user?.clientId || req.clientId;

    if (!clientId) {
      throw new BadRequestException('Client ID not found in session');
    }

    // Update webhook configuration (validation handled by DTO decorators)
    await this.clientService.updateWebhookConfig(
      clientId,
      dto.webhookUrl,
      dto.webhookSecret,
    );

    return {
      success: true,
      webhookUrl: dto.webhookUrl,
    };
  }

  /**
   * Test Webhook Endpoint
   *
   * Sends a test webhook payload to verify client endpoint is reachable and responding correctly.
   *
   * @remarks
   * **Endpoint**: POST /api/v1/client/webhook/test
   *
   * **Test Payload Structure**:
   * ```json
   * {
   *   "id": "evt_test_a1b2c3d4-e5f6-7890-abcd-ef1234567890",
   *   "event": "kyc.test",
   *   "timestamp": "2026-01-06T10:30:00.000Z",
   *   "data": {
   *     "message": "Test webhook from EnxtAI KYC"
   *   }
   * }
   * ```
   *
   * **Headers Sent**:
   * - `Content-Type: application/json`
   * - `X-Signature: sha256=<hmac_signature>` (HMAC-SHA256 of payload with webhook secret)
   * - `X-Event-Type: kyc.test`
   *
   * **Response Format**:
   * ```json
   * {
   *   "success": true,
   *   "statusCode": 200,
   *   "responseTime": "245ms"
   * }
   * ```
   *
   * **Error Response**:
   * ```json
   * {
   *   "success": false,
   *   "error": "Connection timeout after 10s"
   * }
   * ```
   *
   * **Validation**:
   * - Client must verify HMAC signature in X-Signature header
   * - Signature calculated as: HMAC-SHA256(payload, webhookSecret)
   * - Compare using constant-time comparison to prevent timing attacks
   *
   * **Error Scenarios**:
   * - 400 Bad Request: Webhook not configured (URL or secret missing)
   * - 401 Unauthorized: Invalid session token
   * - Timeout: Client endpoint doesn't respond within 10 seconds
   * - Network Error: DNS resolution failed, connection refused, etc.
   *
   * **Timeout**: 10 seconds
   *
   * **Client Verification Instructions**:
   * 1. Extract X-Signature header from request
   * 2. Calculate HMAC-SHA256 of request body using your webhook secret
   * 3. Compare calculated signature with X-Signature value
   * 4. Reject request if signatures don't match
   * 5. Return 200 OK to acknowledge receipt
   *
   * @param req - Request object with clientId from session
   * @returns Test result with status code, response time, and any errors
   */
  @Post('webhook/test')
  async testWebhook(@Req() req: any) {
    const clientId = req.user?.clientId || req.clientId;

    if (!clientId) {
      throw new BadRequestException('Client ID not found in session');
    }

    // Fetch client record to get webhook configuration
    const client = await this.clientService.getClientById(clientId);

    if (!client) {
      throw new BadRequestException('Client not found');
    }

    // Validate webhook is configured
    if (!client.webhookUrl || !client.webhookSecret) {
      throw new BadRequestException(
        'Webhook not configured. Please set webhook URL and secret first.',
      );
    }

    // Create test payload data
    const testData = {
      message: 'Test webhook from EnxtAI KYC',
    };

    // Measure response time
    const startTime = Date.now();

    // Send test webhook using existing webhook service
    // This will use HMAC signature generation and proper headers
    const result = await this.webhookService.sendWebhook(
      clientId,
      WebhookEvent.KYC_TEST,
      testData,
    );

    const responseTime = Date.now() - startTime;

    return {
      success: result.success,
      statusCode: result.statusCode,
      responseTime: `${responseTime}ms`,
      error: result.error,
    }
  }

  /**
   * Get Webhook Delivery Logs
   *
   * Retrieves paginated webhook delivery history for debugging and monitoring.
   *
   * @remarks
   * **Endpoint**: GET /api/v1/client/webhook/logs?page=1&limit=50
   *
   * **Query Parameters**:
   * - `page` (optional): Page number, default 1, 1-indexed
   * - `limit` (optional): Items per page, default 50, max 100
   *
   * **Response Format**:
   * ```json
   * {
   *   "logs": [
   *     {
   *       "id": "log_123",
   *       "event": "kyc.verification_completed",
   *       "responseStatus": 200,
   *       "createdAt": "2026-01-06T10:30:00.000Z",
   *       "attemptCount": 1
   *     }
   *   ],
   *   "total": 1234,
   *   "page": 1,
   *   "limit": 50,
   *   "totalPages": 25
   * }
   * ```
   *
   * **Pagination Logic**:
   * - Default page size: 50 logs
   * - Maximum page size: 100 logs (enforced by Math.min)
   * - Skip calculation: (page - 1) * limit
   * - Total pages: Math.ceil(total / limit)
   *
   * **Log Fields**:
   * - `id`: Unique log identifier
   * - `event`: Webhook event type (e.g., kyc.verification_completed)
   * - `responseStatus`: HTTP status code from client endpoint (200, 500, etc.) or null if network error
   * - `createdAt`: ISO 8601 timestamp of delivery attempt
   * - `attemptCount`: Number of delivery attempts (1 = success on first try, 2+ = retries)
   *
   * **Filtering** (Future Enhancement):
   * - Filter by event type: ?event=kyc.verification_completed
   * - Filter by status: ?status=failed
   * - Date range: ?startDate=2026-01-01&endDate=2026-01-31
   *
   * **Log Retention Policy**:
   * - Default: 30 days
   * - Enterprise tier: 90 days
   * - Automatic cleanup via scheduled job
   *
   * **Error Scenarios**:
   * - 401 Unauthorized: Invalid session token
   * - 400 Bad Request: Invalid pagination parameters
   *
   * @param req - Request object with clientId from session
   * @param page - Page number (1-indexed)
   * @param limit - Items per page (max 100)
   * @returns Paginated webhook logs with metadata
   */
  @Get('webhook/logs')
  async getWebhookLogs(
    @Req() req: any,
    @Query('page') page: string,
    @Query('limit') limit: string,
  ) {
    const clientId = req.user?.clientId || req.clientId;

    if (!clientId) {
      throw new BadRequestException('Client ID not found in session');
    }

    // Parse pagination parameters with defaults
    const pageNum = parseInt(page) || 1;
    const limitNum = Math.min(parseInt(limit) || 50, 100); // Max 100 per page

    // Calculate skip for pagination
    const skip = (pageNum - 1) * limitNum;

    // Query webhook logs
    const logs = await this.webhookService.getWebhookLogs(
      clientId,
      skip,
      limitNum,
    );

    // Get total count for pagination metadata
    const total = await this.webhookService.getWebhookLogsCount(clientId);

    return {
      logs: logs.map((log: any) => ({
        id: log.id,
        event: log.event,
        responseStatus: log.responseStatus,
        createdAt: log.createdAt,
        attemptCount: log.attemptCount,
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    };
  }

  /**
   * Get Dashboard Statistics
   *
   * Retrieves aggregated KYC submission metrics for client dashboard.
   *
   * @remarks
   * **Endpoint**: GET /api/v1/client/stats
   *
   * **Response Format**:
   * ```json
   * {
   *   "totalSubmissions": 1234,
   *   "verifiedCount": 980,
   *   "pendingReviewCount": 45,
   *   "rejectedCount": 209,
   *   "rejectionRate": 16.9
   * }
   * ```
   *
   * **Caching**: Consider adding Redis cache with 5-minute TTL for performance
   *
   * **Tenant Isolation**: Stats scoped to clientId from session
   */
  @Get('stats')
  async getStats(@Req() req: any) {
    const clientId = req.user?.clientId || req.clientId;

    if (!clientId) {
      throw new BadRequestException('Client ID not found in session');
    }

    return this.clientService.getClientStats(clientId);
  }

  /**
   * Get Submissions List (Paginated & Filtered)
   *
   * Retrieves KYC submissions for client portal table with filtering and pagination.
   *
   * @remarks
   * **Endpoint**: GET /api/v1/client/submissions?page=1&limit=20&status=VERIFIED&search=user123
   *
   * **Query Parameters**:
   * - `page` (optional): Page number, default 1, 1-indexed
   * - `limit` (optional): Items per page, default 20, max 100
   * - `status` (optional): Filter by internalStatus (VERIFIED, PENDING_REVIEW, REJECTED, etc.)
   * - `search` (optional): Search by externalUserId or email (case-insensitive)
   * - `startDate` (optional): Filter by submissionDate >= startDate (ISO 8601)
   * - `endDate` (optional): Filter by submissionDate <= endDate (ISO 8601)
   *
   * **Response Format**:
   * ```json
   * {
   *   "submissions": [
   *     {
   *       "id": "uuid",
   *       "externalUserId": "client-user-123",
   *       "email": "user@example.com",
   *       "phone": "+919876543210",
   *       "internalStatus": "VERIFIED",
   *       "finalStatus": "COMPLETE",
   *       "faceMatchScore": 0.87,
   *       "livenessScore": 0.92,
   *       "submissionDate": "2026-01-05T10:30:00.000Z",
   *       "updatedAt": "2026-01-05T10:35:00.000Z"
   *     }
   *   ],
   *   "total": 1234,
   *   "page": 1,
   *   "limit": 20,
   *   "totalPages": 62
   * }
   * ```
   *
   * **Sorting**: Default order by submissionDate DESC (newest first)
   *
   * **Tenant Isolation**: All submissions filtered by clientId from session
   */
  @Get('submissions')
  async getSubmissions(
    @Req() req: any,
    @Query('page') page: string,
    @Query('limit') limit: string,
    @Query('status') status: string,
    @Query('search') search: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    const clientId = req.user?.clientId || req.clientId;

    if (!clientId) {
      throw new BadRequestException('Client ID not found in session');
    }

    // Parse pagination parameters
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 20;

    // Parse date filters
    const filters: any = {};
    if (status) filters.status = status;
    if (search) filters.search = search;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    return this.clientService.getClientSubmissions(clientId, filters, pageNum, limitNum);
  }

  /**
   * Get Submission Detail
   *
   * Retrieves full submission data with presigned URLs for document viewing.
   *
   * @remarks
   * **Endpoint**: GET /api/v1/client/submissions/:id
   *
   * **Response Format**:
   * ```json
   * {
   *   "id": "uuid",
   *   "externalUserId": "client-user-123",
   *   "email": "user@example.com",
   *   "internalStatus": "VERIFIED",
   *   "panNumber": "ABCDE1234F",
   *   "aadhaarNumber": "XXXX XXXX 1234",
   *   "fullName": "John Doe",
   *   "dateOfBirth": "1990-01-15",
   *   "faceMatchScore": 0.87,
   *   "presignedUrls": {
   *     "panDocument": "https://minio.../pan.jpg?X-Amz-Expires=3600",
   *     "aadhaarFront": "https://minio.../aadhaar-front.jpg?...",
   *     "livePhoto": "https://minio.../live.jpg?..."
   *   }
   * }
   * ```
   *
   * **Presigned URLs**: Valid for 1 hour, regenerate if expired
   *
   * **Tenant Isolation**: Validates submission belongs to client
   *
   * **Error Scenarios**:
   * - 404 Not Found: Submission doesn't exist or belongs to different client
   */
  @Get('submissions/:id')
  async getSubmissionDetail(@Req() req: any, @Param('id') submissionId: string) {
    const clientId = req.user?.clientId || req.clientId;

    if (!clientId) {
      throw new BadRequestException('Client ID not found in session');
    }

    return this.clientService.getSubmissionDetail(clientId, submissionId);
  }

  /**
   * Client Forgot Password
   *
   * Initiates password reset flow for client users.
   * Generates reset token and prepares email with magic link.
   *
   * @remarks
   * **Endpoint**: POST /api/v1/client/forgot-password
   * **Authentication**: None required (unauthenticated endpoint)
   *
   * **Request Body**:
   * ```json
   * {
   *   "email": "user@example.com"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true
   * }
   * ```
   *
   * **Security Considerations**:
   * - Generic success response regardless of email existence (prevents enumeration)
   * - Rate limited to 3 requests per hour per email
   * - Reset link logged to console (MVP - future: email integration)
   * - HTTPS enforced by infrastructure
   *
   * @param forgotPasswordDto - Email address for password reset
   * @returns Generic success response
   */
  @UseGuards() // Override controller guards - unauthenticated endpoint
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(forgotPasswordDto.email, 'client');
  }

  /**
   * Client Reset Password
   *
   * Resets client user password using valid reset token.
   * Validates token, updates password, and clears reset token.
   *
   * @remarks
   * **Endpoint**: POST /api/v1/client/reset-password
   * **Authentication**: None required (token-based flow)
   *
   * **Request Body**:
   * ```json
   * {
   *   "token": "550e8400-e29b-41d4-a716-446655440000",
   *   "password": "NewSecurePassword123!"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true,
   *   "message": "Password reset successfully"
   * }
   * ```
   *
   * **Security Considerations**:
   * - Token validated for format (UUID) and expiry (1 hour)
   * - Single-use tokens (cleared after successful reset)
   * - Password hashed with bcrypt (12 salt rounds)
   * - mustChangePassword flag cleared
   * - HTTPS enforced by infrastructure
   *
   * @param resetPasswordDto - Token and new password
   * @returns Success confirmation
   */
  @UseGuards() // Override controller guards - unauthenticated endpoint
  @Post('reset-password')
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto) {
    const user = await this.authService.validateResetToken(resetPasswordDto.token);
    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.authService.updatePassword(user.id, resetPasswordDto.newPassword);
    return { success: true, message: 'Password reset successfully' };
  }

  /**
   * Change Password (Session-Based)
   *
   * Allows authenticated client users to change their password.
   * Used for forced first-login password reset and voluntary password changes.
   *
   * @remarks
   * **Endpoint**: POST /api/v1/client/change-password
   * **Authentication**: Requires valid NextAuth session token
   *
   * **Request Body**:
   * ```json
   * {
   *   "newPassword": "NewSecurePassword123!"
   * }
   * ```
   *
   * **Success Response** (200 OK):
   * ```json
   * {
   *   "success": true,
   *   "message": "Password changed successfully"
   * }
   * ```
   *
   * **Security Considerations**:
   * - Session-based authentication (no reset token required)
   * - Password hashed with bcrypt (12 salt rounds)
   * - mustChangePassword flag cleared automatically
   * - No email/forgot-password flow (session-only)
   *
   * @param req - Request object with userId from session
   * @param changePasswordDto - New password with strength validation
   * @returns Success confirmation
   */
  @Post('change-password')
  async changePassword(@Req() req: any, @Body() changePasswordDto: ChangePasswordDto) {
    const userId = req.user?.userId;

    if (!userId) {
      throw new BadRequestException('User ID not found in session');
    }

    await this.authService.updatePassword(userId, changePasswordDto.newPassword, false, changePasswordDto.currentPassword);
    return { success: true, message: 'Password changed successfully' };
  }
}
