import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Put, UseGuards, Req } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApproveSubmissionDto } from './dto/approve-submission.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { AuthService } from '../auth/auth.service';
import { ForgotPasswordDto } from '../auth/dto/forgot-password.dto';
import { ResetPasswordDto } from '../auth/dto/reset-password.dto';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';
import { BadRequestException } from '@nestjs/common';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly authService: AuthService,
  ) {}

  /**
   * Get Pending KYC Reviews
   *
   * @remarks
   * **Authentication**: Requires SUPER_ADMIN role (enforced by SessionAuthGuard + RolesGuard)
   * **Purpose**: Fetch all KYC submissions pending admin review across all clients
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Get('kyc/pending-review')
  async getPendingReviews() {
    return this.adminService.getPendingReviews();
  }

  /**
   * Get KYC Submission Details
   *
   * @remarks
   * **Authentication**: Requires SUPER_ADMIN role (enforced by SessionAuthGuard + RolesGuard)
   * **Purpose**: Fetch detailed KYC submission data with presigned URLs for document viewing
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Get('kyc/submission/:id')
  async getSubmission(@Param('id') id: string) {
    return this.adminService.getSubmissionWithPresignedUrls(id);
  }

  /**
   * Approve KYC Submission
   *
   * @remarks
   * **Authentication**: Requires SUPER_ADMIN role (enforced by SessionAuthGuard + RolesGuard)
   * **Purpose**: Mark KYC submission as verified and trigger client webhook notification
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('kyc/approve')
  async approve(@Body() dto: ApproveSubmissionDto) {
    try {
      const submission = await this.adminService.approveSubmission(dto.submissionId, dto.adminUserId, dto.notes);
      return { success: true, submissionId: submission.id };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Approval failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Reject KYC Submission
   *
   * @remarks
   * **Authentication**: Requires SUPER_ADMIN role (enforced by SessionAuthGuard + RolesGuard)
   * **Purpose**: Mark KYC submission as rejected with reason and trigger client webhook notification
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('kyc/reject')
  async reject(@Body() dto: RejectSubmissionDto) {
    try {
      const submission = await this.adminService.rejectSubmission(dto.submissionId, dto.adminUserId, dto.reason);
      return { success: true, submissionId: submission.id };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Rejection failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Get All Clients
   *
   * Endpoint: GET /api/admin/clients
   *
   * @remarks
   * **Purpose**: List all client organizations for super admin
   * **Response**: Array of AdminClientListItem with masked API keys
   * **Authentication**: Requires SUPER_ADMIN role
   *
   * **Response Format**:
   * ```json
   * [
   *   {
   *     "id": "uuid",
   *     "name": "SMC Private Wealth",
   *     "status": "ACTIVE",
   *     "apiKey": "client_abc...",
   *     "totalKycs": 1234,
   *     "createdAt": "2026-01-05T10:00:00.000Z"
   *   }
   * ]
   * ```
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Get('clients')
  async getAllClients() {
    return this.adminService.getAllClients();
  }

  /**
   * Get Client Detail
   *
   * Endpoint: GET /api/admin/clients/:id
   *
   * @param id - Client UUID
   * @returns AdminClientDetail with usage statistics
   *
   * @remarks
   * **Purpose**: View full client details for editing
   * **Response**: AdminClientDetail with masked sensitive fields
   * **Authentication**: Requires SUPER_ADMIN role
   *
   * **Error Scenarios**:
   * - 404 Not Found: Client doesn't exist
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Get('clients/:id')
  async getClientDetail(@Param('id') id: string) {
    return this.adminService.getClientDetail(id);
  }

  /**
   * Create Client
   *
   * Endpoint: POST /api/admin/clients
   *
   * @param dto - CreateClientDto with name, email, optional webhook config
   * @returns CreateClientResponse with plaintext API key and password
   *
   * @remarks
   * **Purpose**: Onboard new client organization
   * **Response**: Plaintext credentials (SHOW ONCE)
   * **Authentication**: Requires SUPER_ADMIN role
   *
   * **Request Body**:
   * ```json
   * {
   *   "name": "SMC Private Wealth",
   *   "email": "admin@smc.com",
   *   "webhookUrl": "https://smc.com/webhook",
   *   "webhookSecret": "wh_secret_abc123"
   * }
   * ```
   *
   * **Response Format**:
   * ```json
   * {
   *   "id": "uuid",
   *   "name": "SMC Private Wealth",
   *   "apiKey": "client_abc123...",
   *   "defaultAdminEmail": "admin@smc.com",
   *   "defaultAdminPassword": "TempPass123456"
   * }
   * ```
   *
   * **Important**: Display API key and password in UI with copy buttons
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('clients')
  async createClient(@Body() dto: CreateClientDto) {
    return this.adminService.createClient(dto);
  }

  /**
   * Update Client
   *
   * Endpoint: PUT /api/admin/clients/:id
   *
   * @param id - Client UUID
   * @param dto - UpdateClientDto with optional name and status
   * @returns Updated AdminClientDetail
   *
   * @remarks
   * **Purpose**: Update client name or status (suspend/activate)
   * **Response**: Updated client detail
   * **Authentication**: Requires SUPER_ADMIN role
   *
   * **Request Body**:
   * ```json
   * {
   *   "name": "SMC Private Wealth Ltd",
   *   "status": "SUSPENDED"
   * }
   * ```
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Put('clients/:id')
  async updateClient(@Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.adminService.updateClient(id, dto);
  }

  /**
   * Regenerate API Key
   *
   * Endpoint: POST /api/admin/clients/:id/regenerate-key
   *
   * @param id - Client UUID
   * @returns RegenerateApiKeyResponse with new plaintext API key
   *
   * @remarks
   * **Purpose**: Generate new API key (invalidates old one)
   * **Response**: Plaintext API key (SHOW ONCE)
   * **Authentication**: Requires SUPER_ADMIN role
   *
   * **Response Format**:
   * ```json
   * {
   *   "apiKey": "client_new_abc123..."
   * }
   * ```
   *
   * **Warning**: Old API key immediately invalidated
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('clients/:id/regenerate-key')
  async regenerateApiKey(@Param('id') id: string) {
    return this.adminService.regenerateApiKey(id);
  }

  /**
   * Admin Forgot Password
   *
   * Initiates password reset flow for Super Admin users.
   * Generates reset token and prepares email with magic link.
   *
   * @remarks
   * **Endpoint**: POST /api/admin/forgot-password
   * **Authentication**: None required (unauthenticated endpoint)
   *
   * **Request Body**:
   * ```json
   * {
   *   "email": "admin@example.com"
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
   * - Only allows Super Admin users (clientId = null, role = SUPER_ADMIN)
   * - Reset link logged to console (MVP - future: email integration)
   * - HTTPS enforced by infrastructure
   *
   * @param forgotPasswordDto - Email address for password reset
   * @returns Generic success response
   */
  @UseGuards() // Override controller guards - unauthenticated endpoint
  @Post('forgot-password')
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto) {
    return this.authService.requestPasswordReset(forgotPasswordDto.email, 'admin');
  }

  /**
   * Admin Reset Password
   *
   * Resets Super Admin user password using valid reset token.
   * Validates token, updates password, and clears reset token.
   *
   * @remarks
   * **Endpoint**: POST /api/admin/reset-password
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
   * - Only allows Super Admin users (clientId = null, role = SUPER_ADMIN)
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

    // Additional validation: ensure user is Super Admin
    if (user.role !== 'SUPER_ADMIN' || user.clientId !== null) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    await this.authService.updatePassword(user.id, resetPasswordDto.newPassword);
    return { success: true, message: 'Password reset successfully' };
  }

  /**
   * Admin Change Password (Session-Based)
   *
   * Allows authenticated Super Admin users to change their password.
   * Used for voluntary password changes (no forced reset for Super Admin).
   *
   * @remarks
   * **Endpoint**: POST /api/admin/change-password
   * **Authentication**: Requires valid NextAuth session token with SUPER_ADMIN role
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
   * - Session-based authentication (SessionAuthGuard + RolesGuard)
   * - Only SUPER_ADMIN role allowed
   * - Password hashed with bcrypt (12 salt rounds)
   * - mustChangePassword flag cleared automatically
   * - No email/forgot-password flow (session-only self-service)
   *
   * @param req - Request object with userId from session
   * @param changePasswordDto - New password with strength validation
   * @returns Success confirmation
   */
  @UseGuards(SessionAuthGuard, RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('change-password')
  async changePassword(@Req() req: any, @Body() changePasswordDto: ChangePasswordDto) {
    const userId = req.user?.userId;

    if (!userId) {
      throw new BadRequestException('User ID not found in session');
    }

    // Validate user is Super Admin (additional safety check)
    const user = await this.authService.findClientUserById(userId);
    if (!user || user.role !== 'SUPER_ADMIN') {
      throw new BadRequestException('Unauthorized: Super Admin access required');
    }

    await this.authService.updatePassword(userId, changePasswordDto.newPassword, false, changePasswordDto.currentPassword);
    return { success: true, message: 'Password changed successfully' };
  }
}
