import { Body, Controller, Get, HttpException, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApproveSubmissionDto } from './dto/approve-submission.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';
import { SessionAuthGuard } from '../common/guards/session-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

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
}
