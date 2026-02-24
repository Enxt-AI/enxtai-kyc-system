import {
  Controller,
  Post,
  Get,
  Head,
  Body,
  Param,
  Req,
  BadRequestException,
  UseInterceptors,
  HttpCode,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiSecurity,
  ApiConsumes,
  ApiBody,
  ApiParam,
} from '@nestjs/swagger';
import { FastifyRequest } from 'fastify';
import { ClientKycService } from './client-kyc.service';
import { Client } from '../common/decorators/tenant.decorator';
import { InitiateKycDto } from './dto/initiate-kyc.dto';
import {
  InitiateKycResponseDto,
  KycStatusResponseDto,
  UploadResponseDto,
} from './dto/client-kyc-response.dto';

/**
 * Client KYC Controller
 *
 * REST API endpoints for client-facing KYC verification. All routes protected by
 * TenantMiddleware which validates X-API-Key and injects clientId into request context.
 *
 * **Route Pattern:**
 * - Base path: `/v1/kyc/*` (matches TenantMiddleware route pattern)
 * - Full URLs: `/api/v1/kyc/*` (with global prefix)
 * - Authentication: Required X-API-Key header on all endpoints
 *
 * **Multi-Tenancy:**
 * - clientId extracted from API key by TenantMiddleware
 * - All operations scoped to authenticated client
 * - Prevents cross-tenant data access
 *
 * **Error Codes:**
 * - `INVALID_API_KEY`: Missing or invalid X-API-Key header (401)
 * - `USER_NOT_FOUND`: External user ID not found (404)
 * - `SUBMISSION_NOT_FOUND`: KYC session ID not found (404)
 * - `TENANT_MISMATCH`: Session belongs to different client (403)
 * - `FILE_TOO_LARGE`: Upload exceeds 5MB limit (413)
 * - `INVALID_FILE_TYPE`: Non-JPEG/PNG file (400)
 * - `INVALID_DIMENSIONS`: Image dimensions out of range (400)
 *
 * @see {@link ClientKycService} for business logic
 * @see {@link TenantMiddleware} for authentication
 */
@ApiTags('KYC')
@ApiSecurity('api-key')
@Controller('v1/kyc')
export class ClientKycController {
  constructor(private readonly clientKycService: ClientKycService) {}

  /**
   * HEAD /v1/kyc/validate
   *
   * Lightweight endpoint for validating API key without processing a full request.
   * TenantMiddleware validates the X-API-Key header and domain whitelist.
   * Returns 200 if valid, 401 if invalid, or 403 if domain not whitelisted.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   *
   * **Use Case:**
   * - Secure entry page validates API key before showing KYC form
   * - Client integrations can verify API key is active
   *
   * **Response Codes:**
   * - 200: API key is valid and domain is whitelisted
   * - 401: Invalid or inactive API key
   * - 403: Domain not whitelisted for this API key
   *
   * **cURL Example:**
   * ```bash
   * curl -I https://api.example.com/api/v1/kyc/validate \
   *   -H "X-API-Key: your-api-key-here"
   * ```
   */
  @Head('validate')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Validate API Key',
    description: 'Validates X-API-Key header. Returns 200 if valid, 401 if invalid, 403 if domain not whitelisted.',
  })
  @ApiResponse({ status: 200, description: 'API key is valid' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  @ApiResponse({ status: 403, description: 'Domain not whitelisted for this API key' })
  async validateApiKey(): Promise<void> {
    // TenantMiddleware has already validated API key and domain
    // If we reach here, the key is valid
    return;
  }

  /**
   * POST /v1/kyc/initiate
   *
   * Initiates a new KYC verification session for a client's end-user. Returns session ID
   * and upload URLs for document submission.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   * - `Content-Type`: application/json
   *
   * **Request Body:**
   * ```json
   * {
   *   "externalUserId": "customer-12345",
   *   "email": "john.doe@example.com",
   *   "phone": "+919876543210",
   *   "metadata": {
   *     "transactionId": "txn-abc-123",
   *     "source": "mobile-app"
   *   }
   * }
   * ```
   *
   * **Response (201 Created):**
   * ```json
   * {
   *   "kycSessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d",
   *   "status": "PENDING",
   *   "uploadUrls": {
   *     "pan": "/v1/kyc/upload/pan",
   *     "aadhaarFront": "/v1/kyc/upload/aadhaar/front",
   *     "aadhaarBack": "/v1/kyc/upload/aadhaar/back",
   *     "livePhoto": "/v1/kyc/upload/live-photo"
   *   }
   * }
   * ```
   *
   * **cURL Example:**
   * ```bash
   * curl -X POST https://api.example.com/api/v1/kyc/initiate \
   *   -H "X-API-Key: your-api-key-here" \
   *   -H "Content-Type: application/json" \
   *   -d '{
   *     "externalUserId": "customer-12345",
   *     "email": "john@example.com",
   *     "phone": "+919876543210"
   *   }'
   * ```
   *
   * @param client - Authenticated client object (injected by @Client() decorator)
   * @param dto - Request payload with externalUserId, email, phone, metadata
   * @returns Session ID, status, and upload URLs
   */
  @Post('initiate')
  @ApiOperation({
    summary: 'Initiate KYC Session',
    description: 'Creates a new KYC verification session for a client end-user. Returns session ID and upload URLs.',
  })
  @ApiResponse({
    status: 201,
    description: 'KYC session created successfully',
    type: InitiateKycResponseDto,
  })
  @ApiResponse({ status: 400, description: 'Invalid request body (missing externalUserId)' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded (100 req/min)' })
  async initiateKyc(
    @Client() client: any,
    @Body() dto: InitiateKycDto,
  ): Promise<InitiateKycResponseDto> {
    return await this.clientKycService.initiateKyc(client.id, dto);
  }

  /**
   * POST /v1/kyc/upload/pan
   *
   * Uploads PAN card document. Multipart form must include `externalUserId` field
   * and `file` attachment.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   * - `Content-Type`: multipart/form-data
   *
   * **Multipart Form Fields:**
   * - `externalUserId` (text): Client's user identifier (e.g., "customer-12345")
   * - `file` (file): PAN card image (JPEG/PNG, max 5MB)
   *
   * **File Validation:**
   * - MIME types: image/jpeg, image/png
   * - Max size: 5MB
   * - Min dimensions: 300x300px
   * - Max dimensions: 8192x8192px
   *
   * **Response (200 OK):**
   * ```json
   * {
   *   "success": true,
   *   "kycSessionId": "a1b2c3d4-...",
   *   "documentUrl": "kyc-abc123-pan/user-uuid/PAN_CARD_1735987654321.jpg"
   * }
   * ```
   *
   * **cURL Example:**
   * ```bash
   * curl -X POST https://api.example.com/api/v1/kyc/upload/pan \
   *   -H "X-API-Key: your-api-key-here" \
   *   -F "externalUserId=customer-12345" \
   *   -F "file=@/path/to/pan-card.jpg"
   * ```
   *
   * @param client - Authenticated client object
   * @param req - Fastify request (for multipart parsing)
   * @returns Upload success response with session ID and document URL
   */
  @Post('upload/pan')
  @ApiOperation({
    summary: 'Upload PAN Card',
    description: 'Uploads PAN card document image. Accepts JPEG/PNG, max 5MB.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['externalUserId', 'file'],
      properties: {
        externalUserId: { type: 'string', example: 'customer-12345' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'PAN card uploaded successfully', type: UploadResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file type or missing fields' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  @ApiResponse({ status: 413, description: 'File size exceeds 5MB limit' })
  async uploadPan(@Client() client: any, @Req() req: FastifyRequest): Promise<UploadResponseDto> {
    if (!client) {
      throw new BadRequestException('Client not authenticated - middleware may not be applied to this route');
    }
    const { externalUserId, file } = await this.parseMultipartUpload(req);
    return await this.clientKycService.uploadPan(client.id, externalUserId, file);
  }

  /**
   * POST /v1/kyc/upload/aadhaar/front
   *
   * Uploads Aadhaar card front side. Front side must contain user's photograph
   * for face verification.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   * - `Content-Type`: multipart/form-data
   *
   * **Multipart Form Fields:**
   * - `externalUserId` (text): Client's user identifier
   * - `file` (file): Aadhaar front image (JPEG/PNG, max 5MB)
   *
   * **Document Requirements:**
   * - Must be front side (with photograph)
   * - Photograph used for face matching against live photo
   * - Same validation rules as PAN upload
   *
   * **Response (200 OK):**
   * ```json
   * {
   *   "success": true,
   *   "kycSessionId": "a1b2c3d4-...",
   *   "documentUrl": "kyc-abc123-aadhaar-cards/user-uuid/AADHAAR_CARD_FRONT_..."
   * }
   * ```
   *
   * **cURL Example:**
   * ```bash
   * curl -X POST https://api.example.com/api/v1/kyc/upload/aadhaar/front \
   *   -H "X-API-Key: your-api-key-here" \
   *   -F "externalUserId=customer-12345" \
   *   -F "file=@/path/to/aadhaar-front.jpg"
   * ```
   *
   * @param client - Authenticated client object
   * @param req - Fastify request (for multipart parsing)
   * @returns Upload success response
   */
  @Post('upload/aadhaar/front')
  @ApiOperation({
    summary: 'Upload Aadhaar Front',
    description: 'Uploads Aadhaar card front side (with photograph). Required for face verification.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['externalUserId', 'file'],
      properties: {
        externalUserId: { type: 'string', example: 'customer-12345' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Aadhaar front uploaded successfully', type: UploadResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file type or missing fields' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  async uploadAadhaarFront(
    @Client() client: any,
    @Req() req: FastifyRequest,
  ): Promise<UploadResponseDto> {
    if (!client) {
      throw new BadRequestException('Client not authenticated - middleware may not be applied to this route');
    }
    const { externalUserId, file } = await this.parseMultipartUpload(req);
    return await this.clientKycService.uploadAadhaarFront(client.id, externalUserId, file);
  }

  /**
   * POST /v1/kyc/upload/aadhaar/back
   *
   * Uploads Aadhaar card back side. Back side contains address information
   * extracted via OCR.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   * - `Content-Type`: multipart/form-data
   *
   * **Multipart Form Fields:**
   * - `externalUserId` (text): Client's user identifier
   * - `file` (file): Aadhaar back image (JPEG/PNG, max 5MB)
   *
   * **Document Requirements:**
   * - Must be back side (with address)
   * - Address details extracted via Tesseract.js OCR
   * - Same validation rules as PAN upload
   *
   * **Response (200 OK):**
   * ```json
   * {
   *   "success": true,
   *   "kycSessionId": "a1b2c3d4-...",
   *   "documentUrl": "kyc-abc123-aadhaar-cards/user-uuid/AADHAAR_CARD_BACK_..."
   * }
   * ```
   *
   * **cURL Example:**
   * ```bash
   * curl -X POST https://api.example.com/api/v1/kyc/upload/aadhaar/back \
   *   -H "X-API-Key: your-api-key-here" \
   *   -F "externalUserId=customer-12345" \
   *   -F "file=@/path/to/aadhaar-back.jpg"
   * ```
   *
   * @param client - Authenticated client object
   * @param req - Fastify request (for multipart parsing)
   * @returns Upload success response
   */
  @Post('upload/aadhaar/back')
  @ApiOperation({
    summary: 'Upload Aadhaar Back',
    description: 'Uploads Aadhaar card back side (with address). Used for address extraction via OCR.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['externalUserId', 'file'],
      properties: {
        externalUserId: { type: 'string', example: 'customer-12345' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Aadhaar back uploaded successfully', type: UploadResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file type or missing fields' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  async uploadAadhaarBack(
    @Client() client: any,
    @Req() req: FastifyRequest,
  ): Promise<UploadResponseDto> {
    const { externalUserId, file } = await this.parseMultipartUpload(req);
    return await this.clientKycService.uploadAadhaarBack(client.id, externalUserId, file);
  }

  /**
   * POST /v1/kyc/upload/live-photo
   *
   * Uploads user's live photograph for face verification. This photo is compared
   * against the photograph on Aadhaar front side using face-api.js.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   * - `Content-Type`: multipart/form-data
   *
   * **Multipart Form Fields:**
   * - `externalUserId` (text): Client's user identifier
   * - `file` (file): Live photo (JPEG/PNG, max 5MB)
   *
   * **Verification Logic:**
   * - Live photo compared against Aadhaar front photograph
   * - face-api.js computes similarity score (0.0 to 1.0)
   * - Score >= 0.6: Auto-approved (FACE_VERIFIED status)
   * - Score < 0.6: Manual review required (MANUAL_REVIEW status)
   *
   * **Response (200 OK):**
   * ```json
   * {
   *   "success": true,
   *   "kycSessionId": "a1b2c3d4-...",
   *   "documentUrl": "kyc-abc123-live-photos/user-uuid/LIVE_PHOTO_..."
   * }
   * ```
   *
   * **cURL Example:**
   * ```bash
   * curl -X POST https://api.example.com/api/v1/kyc/upload/live-photo \
   *   -H "X-API-Key: your-api-key-here" \
   *   -F "externalUserId=customer-12345" \
   *   -F "file=@/path/to/live-photo.jpg"
   * ```
   *
   * @param client - Authenticated client object
   * @param req - Fastify request (for multipart parsing)
   * @returns Upload success response
   */
  @Post('upload/live-photo')
  @ApiOperation({
    summary: 'Upload Live Photo',
    description: 'Uploads live photograph for face verification. Compared against Aadhaar front photograph.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['externalUserId', 'file'],
      properties: {
        externalUserId: { type: 'string', example: 'customer-12345' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Live photo uploaded successfully', type: UploadResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file type or missing fields' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  async uploadLivePhoto(
    @Client() client: any,
    @Req() req: FastifyRequest,
  ): Promise<UploadResponseDto> {
    const { externalUserId, file } = await this.parseMultipartUpload(req);
    return await this.clientKycService.uploadLivePhoto(client.id, externalUserId, file);
  }

  /**
   * POST /v1/kyc/upload/signature
   *
   * Uploads user's signature image for verification.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   * - `Content-Type`: multipart/form-data
   *
   * **Multipart Fields:**
   * - `externalUserId` (string, required): Client's user identifier
   * - `file` (binary, required): Signature image file (JPEG/PNG)
   *
   * **cURL Example:**
   * ```bash
   * curl -X POST https://api.example.com/api/v1/kyc/upload/signature \
   *   -H "X-API-Key: your-api-key-here" \
   *   -F "externalUserId=customer-12345" \
   *   -F "file=@/path/to/signature.png"
   * ```
   *
   * @param client - Authenticated client object
   * @param req - Fastify request (for multipart parsing)
   * @returns Upload success response
   */
  @Post('upload/signature')
  @ApiOperation({
    summary: 'Upload Signature',
    description: 'Uploads user signature image for verification.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['externalUserId', 'file'],
      properties: {
        externalUserId: { type: 'string', example: 'customer-12345' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Signature uploaded successfully', type: UploadResponseDto })
  @ApiResponse({ status: 400, description: 'Invalid file type or missing fields' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  async uploadSignature(
    @Client() client: any,
    @Req() req: FastifyRequest,
  ): Promise<UploadResponseDto> {
    const { externalUserId, file } = await this.parseMultipartUpload(req);
    return await this.clientKycService.uploadSignature(client.id, externalUserId, file);
  }

  /**
   * GET /v1/kyc/status/:kycSessionId
   *
   * Retrieves detailed status information for a KYC session. Includes extracted data,
   * verification scores, and progress tracking.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   *
   * **Response (200 OK):**
   * ```json
   * {
   *   "kycSessionId": "a1b2c3d4-...",
   *   "externalUserId": "customer-12345",
   *   "status": "FACE_VERIFIED",
   *   "progress": 100,
   *   "extractedData": {
   *     "panNumber": "ABCDE1234F",
   *     "aadhaarNumber": "1234 5678 9012",
   *     "fullName": "JOHN DOE",
   *     "dateOfBirth": "01/01/1990",
   *     "address": "123 Main St, Mumbai, MH 400001"
   *   },
   *   "verificationScores": {
   *     "faceMatchScore": 0.95,
   *     "livenessScore": 0.88
   *   },
   *   "createdAt": "2026-01-05T10:30:00Z",
   *   "updatedAt": "2026-01-05T10:45:00Z"
   * }
   * ```
   *
   * **Status Values:**
   * - `PENDING`: Session created, no documents uploaded
   * - `DOCUMENTS_UPLOADED`: All documents received, awaiting OCR
   * - `OCR_COMPLETED`: Text extraction complete, awaiting face verification
   * - `FACE_VERIFIED`: All verifications passed (auto-approved)
   * - `MANUAL_REVIEW`: Confidence below threshold, needs admin review
   * - `APPROVED`: Admin approved (manual review path)
   * - `REJECTED`: Admin rejected or verification failed
   *
   * **cURL Example:**
   * ```bash
   * curl -X GET https://api.example.com/api/v1/kyc/status/a1b2c3d4-... \
   *   -H "X-API-Key: your-api-key-here"
   * ```
   *
   * @param client - Authenticated client object
   * @param kycSessionId - KYC session UUID (from initiate response)
   * @returns Detailed status with extracted data and verification scores
   */
  @Get('status/:kycSessionId')
  @ApiOperation({
    summary: 'Get KYC Status',
    description: 'Retrieves detailed status information for a KYC session including extracted data and verification scores.',
  })
  @ApiParam({ name: 'kycSessionId', description: 'KYC session UUID', example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' })
  @ApiResponse({ status: 200, description: 'Status retrieved successfully', type: KycStatusResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  @ApiResponse({ status: 403, description: 'Session belongs to different client' })
  @ApiResponse({ status: 404, description: 'KYC session not found' })
  async getStatus(
    @Client() client: any,
    @Param('kycSessionId') kycSessionId: string,
  ): Promise<KycStatusResponseDto> {
    return await this.clientKycService.getKycStatus(client.id, kycSessionId);
  }

  /**
   * POST /v1/kyc/verify
   *
   * Manually triggers face verification workflow. This is optional as verification
   * can be auto-triggered when all documents are uploaded.
   *
   * **Request Headers:**
   * - `X-API-Key`: Client's API key (required)
   * - `Content-Type`: application/json
   *
   * **Request Body:**
   * ```json
   * {
   *   "kycSessionId": "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d"
   * }
   * ```
   *
   * **Verification Workflow:**
   * 1. Downloads live photo and Aadhaar front from MinIO
   * 2. Detects faces using face-api.js SSD MobileNet
   * 3. Computes 128-dimension face descriptors
   * 4. Calculates Euclidean distance (similarity score)
   * 5. Updates submission with scores and status
   *
   * **Auto-Approval Logic:**
   * - faceMatchScore >= 0.6: Status → FACE_VERIFIED
   * - faceMatchScore < 0.6: Status → MANUAL_REVIEW
   *
   * **Response (200 OK):**
   * ```json
   * {
   *   "success": true,
   *   "status": "FACE_VERIFIED",
   *   "faceMatchScore": 0.95,
   *   "livenessScore": 0.88
   * }
   * ```
   *
   * **cURL Example:**
   * ```bash
   * curl -X POST https://api.example.com/api/v1/kyc/verify \
   *   -H "X-API-Key: your-api-key-here" \
   *   -H "Content-Type: application/json" \
   *   -d '{"kycSessionId": "a1b2c3d4-..."}'
   * ```
   *
   * @param client - Authenticated client object
   * @param body - Request body with kycSessionId
   * @returns Verification results with scores and updated status
   */
  @Post('verify')
  @ApiOperation({
    summary: 'Trigger Verification',
    description: 'Manually triggers face verification workflow. Optional - verification auto-triggers after all documents uploaded.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['kycSessionId'],
      properties: {
        kycSessionId: { type: 'string', example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Verification completed',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        status: { type: 'string', example: 'FACE_VERIFIED' },
        faceMatchScore: { type: 'number', example: 0.95 },
        livenessScore: { type: 'number', example: 0.88 },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Missing documents or invalid session ID' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  async triggerVerification(
    @Client() client: any,
    @Body() body: { kycSessionId: string },
  ): Promise<any> {
    return await this.clientKycService.triggerVerification(client.id, body.kycSessionId);
  }

  /**
   * POST /v1/kyc/delete/pan
   *
   * Deletes PAN card document from storage and clears URL in database.
   *
   * @param client - Authenticated client object
   * @param body - Request body with externalUserId
   * @returns Success response
   */
  @Post('delete/pan')
  @ApiOperation({
    summary: 'Delete PAN Document',
    description: 'Deletes PAN card document from storage and database.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['externalUserId'],
      properties: {
        externalUserId: { type: 'string', example: 'customer-12345' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'PAN document deleted successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deletePan(
    @Client() client: any,
    @Body() body: { externalUserId: string },
  ): Promise<{ success: boolean; message: string }> {
    return await this.clientKycService.deletePan(client.id, body.externalUserId);
  }

  /**
   * POST /v1/kyc/delete/aadhaar/front
   *
   * Deletes Aadhaar front document from storage and clears URL in database.
   *
   * @param client - Authenticated client object
   * @param body - Request body with externalUserId
   * @returns Success response
   */
  @Post('delete/aadhaar/front')
  @ApiOperation({
    summary: 'Delete Aadhaar Front Document',
    description: 'Deletes Aadhaar front document from storage and database.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['externalUserId'],
      properties: {
        externalUserId: { type: 'string', example: 'customer-12345' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Aadhaar front document deleted successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteAadhaarFront(
    @Client() client: any,
    @Body() body: { externalUserId: string },
  ): Promise<{ success: boolean; message: string }> {
    return await this.clientKycService.deleteAadhaarFront(client.id, body.externalUserId);
  }

  /**
   * POST /v1/kyc/delete/aadhaar/back
   *
   * Deletes Aadhaar back document from storage and clears URL in database.
   *
   * @param client - Authenticated client object
   * @param body - Request body with externalUserId
   * @returns Success response
   */
  @Post('delete/aadhaar/back')
  @ApiOperation({
    summary: 'Delete Aadhaar Back Document',
    description: 'Deletes Aadhaar back document from storage and database.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['externalUserId'],
      properties: {
        externalUserId: { type: 'string', example: 'customer-12345' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Aadhaar back document deleted successfully' })
  @ApiResponse({ status: 401, description: 'Invalid or missing X-API-Key header' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deleteAadhaarBack(
    @Client() client: any,
    @Body() body: { externalUserId: string },
  ): Promise<{ success: boolean; message: string }> {
    return await this.clientKycService.deleteAadhaarBack(client.id, body.externalUserId);
  }

  /**
   * Initiate DigiLocker Authorization
   *
   * Generates DigiLocker OAuth 2.0 authorization URL for end-user to authorize document access.
   * The generated URL should be used to redirect the user to DigiLocker for authorization.
   *
   * @param client - Authenticated client from API key
   * @param submissionId - KYC session identifier
   * @returns Authorization URL and instructions
   *
   * @example
   * ```bash
   * curl -X POST "https://api.enxtai.com/v1/kyc/sub_123/digilocker/initiate" \
   *   -H "X-API-Key: your-api-key" \
   *   -H "Content-Type: application/json"
   * ```
   */
  @Post(':submissionId/digilocker/initiate')
  @ApiOperation({
    summary: 'Initiate DigiLocker Authorization',
    description: 'Generates DigiLocker OAuth 2.0 authorization URL for end-user to authorize document access',
  })
  @ApiParam({
    name: 'submissionId',
    description: 'KYC session identifier',
    example: 'sub_12345678-1234-1234-1234-123456789012',
  })
  @ApiResponse({
    status: 200,
    description: 'Authorization URL generated successfully',
    schema: {
      type: 'object',
      properties: {
        authorizationUrl: {
          type: 'string',
          description: 'DigiLocker OAuth authorization URL',
          example: 'https://digilocker.gov.in/public/oauth2/1/authorize?...',
        },
        instructions: {
          type: 'string',
          description: 'Instructions for user',
          example: 'Redirect user to this URL to authorize DigiLocker access. The authorization URL expires in 10 minutes.',
        },
        expiresIn: {
          type: 'number',
          description: 'URL expiry time in seconds',
          example: 600,
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  @ApiResponse({ status: 403, description: 'Submission belongs to different client' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async initiateDigiLockerAuth(
    @Client() client: any,
    @Param('submissionId') submissionId: string,
  ): Promise<{
    authorizationUrl: string;
    instructions: string;
    expiresIn: number;
  }> {
    return await this.clientKycService.initiateDigiLockerAuth(client.id, submissionId);
  }

  /**
   * Fetch Documents from DigiLocker
   *
   * Downloads specified documents from user's DigiLocker account and triggers automatic OCR processing.
   * User must have completed DigiLocker OAuth authorization before calling this endpoint.
   *
   * @param client - Authenticated client from API key
   * @param submissionId - KYC session identifier
   * @param body - Document types to fetch
   * @returns Fetched documents with URLs and processing status
   *
   * @example
   * ```bash
   * curl -X POST "https://api.enxtai.com/v1/kyc/sub_123/digilocker/fetch" \
   *   -H "X-API-Key: your-api-key" \
   *   -H "Content-Type: application/json" \
   *   -d '{"documentTypes": ["PAN", "AADHAAR"]}'
   * ```
   */
  @Post(':submissionId/digilocker/fetch')
  @ApiOperation({
    summary: 'Fetch Documents from DigiLocker',
    description: 'Downloads specified documents from user\'s DigiLocker account and triggers automatic OCR processing',
  })
  @ApiParam({
    name: 'submissionId',
    description: 'KYC session identifier',
    example: 'sub_12345678-1234-1234-1234-123456789012',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        documentTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['PAN', 'AADHAAR'],
          },
          description: 'Document types to fetch from DigiLocker',
          example: ['PAN', 'AADHAAR'],
        },
      },
      required: ['documentTypes'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Documents fetched successfully',
    schema: {
      type: 'object',
      properties: {
        success: { type: 'boolean', example: true },
        kycSessionId: { type: 'string', example: 'sub_123...' },
        documentsFetched: {
          type: 'array',
          items: { type: 'string' },
          example: ['PAN', 'AADHAAR'],
        },
        documentUrls: {
          type: 'object',
          properties: {
            panDocumentUrl: { type: 'string', example: 'kyc-client-pan/user-uuid/pan.jpg' },
            aadhaarFrontUrl: { type: 'string', example: 'kyc-client-aadhaar/user-uuid/aadhaar.jpg' },
          },
        },
        processingStatus: { type: 'string', example: 'OCR and face verification processing initiated' },
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Invalid document types or user not authorized' })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  @ApiResponse({ status: 404, description: 'Documents not found in DigiLocker' })
  @ApiResponse({ status: 429, description: 'DigiLocker rate limit exceeded' })
  async fetchDigiLockerDocuments(
    @Client() client: any,
    @Param('submissionId') submissionId: string,
    @Body() body: { documentTypes: string[] },
  ): Promise<{
    success: boolean;
    kycSessionId: string;
    documentsFetched: string[];
    documentUrls: {
      panDocumentUrl?: string;
      aadhaarFrontUrl?: string;
    };
    processingStatus: string;
  }> {
    // Validate document types
    const validTypes = ['PAN', 'AADHAAR'];
    const invalidTypes = body.documentTypes.filter(type => !validTypes.includes(type));
    if (invalidTypes.length > 0) {
      throw new BadRequestException(`Invalid document types: ${invalidTypes.join(', ')}. Valid types: ${validTypes.join(', ')}`);
    }

    return await this.clientKycService.fetchDigiLockerDocuments(client.id, submissionId, body.documentTypes);
  }

  /**
   * Get DigiLocker Status
   *
   * Retrieves DigiLocker authorization status and available documents for a KYC session.
   * Use this endpoint to check if user has authorized DigiLocker access and what documents are available.
   *
   * @param client - Authenticated client from API key
   * @param submissionId - KYC session identifier
   * @returns DigiLocker status and submission details
   *
   * @example
   * ```bash
   * curl -X GET "https://api.enxtai.com/v1/kyc/sub_123/digilocker/status" \
   *   -H "X-API-Key: your-api-key"
   * ```
   */
  @Get(':submissionId/digilocker/status')
  @ApiOperation({
    summary: 'Get DigiLocker Status',
    description: 'Retrieves DigiLocker authorization status and available documents for a KYC session',
  })
  @ApiParam({
    name: 'submissionId',
    description: 'KYC session identifier',
    example: 'sub_12345678-1234-1234-1234-123456789012',
  })
  @ApiResponse({
    status: 200,
    description: 'DigiLocker status retrieved successfully',
    schema: {
      type: 'object',
      properties: {
        authorized: { type: 'boolean', description: 'Whether user has authorized DigiLocker' },
        documentsFetched: { type: 'boolean', description: 'Whether documents have been fetched' },
        documentSource: {
          type: 'string',
          enum: ['MANUAL_UPLOAD', 'DIGILOCKER'],
          description: 'Source of documents',
        },
        availableDocuments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Documents available in DigiLocker',
          example: ['PAN', 'AADHAAR'],
        },
        submission: {
          type: 'object',
          description: 'KYC submission details',
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid API key' })
  @ApiResponse({ status: 403, description: 'Submission belongs to different client' })
  @ApiResponse({ status: 404, description: 'Submission not found' })
  async getDigiLockerStatus(
    @Client() client: any,
    @Param('submissionId') submissionId: string,
  ): Promise<{
    authorized: boolean;
    documentsFetched: boolean;
    documentSource: 'MANUAL_UPLOAD' | 'DIGILOCKER';
    availableDocuments: string[];
    submission: KycStatusResponseDto;
  }> {
    return await this.clientKycService.getDigiLockerStatus(client.id, submissionId);
  }

  /**
   * Parse Multipart Upload (Helper)
   *
   * Extracts `externalUserId` field and `file` attachment from multipart/form-data request.
   * Buffers file immediately to prevent Fastify stream closure issues.
   *
   * **Multipart Structure:**
   * - Field 1: `externalUserId` (text)
   * - Field 2: `file` (attachment)
   *
   * @param req - Fastify request object
   * @returns Object with externalUserId string and file MultipartFile
   * @throws BadRequestException if fields missing or invalid
   * @private
   */
  private async parseMultipartUpload(
    req: FastifyRequest,
  ): Promise<{ externalUserId: string; file: any }> {
    const data = await req.file();
    if (!data) {
      throw new BadRequestException('No file uploaded');
    }

    // Extract externalUserId from form fields
    // NOTE: externalUserId MUST be sent before file in the multipart request
    // because Fastify streams fields in order, and req.file() returns when file is found
    const externalUserIdField = (data.fields as any)['externalUserId'];
    const externalUserId = externalUserIdField?.value || externalUserIdField;

    if (!externalUserId || typeof externalUserId !== 'string') {
      throw new BadRequestException('Missing or invalid externalUserId field');
    }

    // Buffer file immediately (prevent Fastify stream closure)
    const buffer = await data.toBuffer();
    const file = {
      filename: data.filename,
      mimetype: data.mimetype,
      toBuffer: async () => buffer,
    };

    return { externalUserId, file };
  }
}
