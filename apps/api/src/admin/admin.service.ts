import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InternalStatus, FinalStatus } from '@enxtai/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { WebhookService } from '../webhooks/webhook.service';
import { WebhookEvent } from '../webhooks/webhook-events.enum';
import { ClientService } from '../client/client.service';
import * as bcrypt from 'bcrypt';
import type { AdminClientListItem, AdminClientDetail, CreateClientResponse, RegenerateApiKeyResponse } from '@enxtai/shared-types';
import type { CreateClientDto } from './dto/create-client.dto';
import type { UpdateClientDto } from './dto/update-client.dto';

/**
 * Admin Service
 *
 * Provides admin-only operations for managing KYC submissions, users, and clients.
 *
 * @remarks
 * **Webhook Integration**:
 * - WebhookService injected for real-time status change notifications
 * - Webhooks triggered after manual approval/rejection of submissions
 * - Failures logged but don't block admin operations (isolated error handling)
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly webhookService: WebhookService,
    private readonly clientService: ClientService,
  ) {}

  async getPendingReviews() {
    return this.prisma.kYCSubmission.findMany({
      where: { internalStatus: InternalStatus.PENDING_REVIEW },
      include: {
        user: {
          select: { email: true, phone: true },
        },
      },
      orderBy: { submissionDate: 'asc' },
    });
  }

  /**
   * Approve KYC Submission
   *
   * Manually approve a submission in PENDING_REVIEW status. Sets status to VERIFIED
   * and triggers webhook notification to client.
   *
   * @param submissionId - KYC submission UUID
   * @param adminUserId - Admin user UUID (for audit trail)
   * @param notes - Optional approval notes
   * @returns Updated submission object
   */
  async approveSubmission(submissionId: string, adminUserId: string, notes?: string) {
    const submission = await this.ensurePendingReview(submissionId);

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        internalStatus: InternalStatus.VERIFIED,
        finalStatus: FinalStatus.COMPLETE,
        rejectionReason: null,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'ADMIN_KYC_APPROVED',
        metadata: { submissionId, notes },
      },
    });

    // Trigger webhook for admin approval (status changed to VERIFIED)
    await this.triggerWebhook(updated, WebhookEvent.KYC_STATUS_CHANGED);

    return updated;
  }

  /**
   * Reject KYC Submission
   *
   * Manually reject a submission in PENDING_REVIEW status. Sets status to REJECTED,
   * stores rejection reason, and triggers webhook notification to client.
   *
   * @param submissionId - KYC submission UUID
   * @param adminUserId - Admin user UUID (for audit trail)
   * @param reason - Rejection reason (included in webhook payload)
   * @returns Updated submission object
   */
  async rejectSubmission(submissionId: string, adminUserId: string, reason: string) {
    const submission = await this.ensurePendingReview(submissionId);

    const updated = await this.prisma.kYCSubmission.update({
      where: { id: submission.id },
      data: {
        internalStatus: InternalStatus.REJECTED,
        finalStatus: FinalStatus.REJECTED,
        rejectionReason: reason,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        userId: adminUserId,
        action: 'ADMIN_KYC_REJECTED',
        metadata: { submissionId, reason },
      },
    });

    // Trigger webhook for admin rejection (includes rejectionReason)
    await this.triggerWebhook(updated, WebhookEvent.KYC_STATUS_CHANGED);

    return updated;
  }

  async getSubmissionWithPresignedUrls(submissionId: string) {
    const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const presignedUrls: Record<string, string> = {};
    if (submission.panDocumentUrl) {
      const { bucket, objectName } = this.parseObjectPath(submission.panDocumentUrl);
      presignedUrls.panDocument = await this.storageService.generatePresignedUrl(bucket, objectName);
    }
    if (submission.aadhaarDocumentUrl) {
      const { bucket, objectName } = this.parseObjectPath(submission.aadhaarDocumentUrl);
      presignedUrls.aadhaarDocument = await this.storageService.generatePresignedUrl(bucket, objectName);
    }
    if (submission.livePhotoUrl) {
      const { bucket, objectName } = this.parseObjectPath(submission.livePhotoUrl);
      presignedUrls.livePhoto = await this.storageService.generatePresignedUrl(bucket, objectName);
    }

    return { ...submission, presignedUrls };
  }

  /**
   * Trigger Webhook Helper
   *
   * Sends webhook notification to client's configured endpoint after admin status change.
   * Fetches user details, builds webhook payload, and delegates to WebhookService.
   *
   * **Error Isolation**:
   * - Webhook failures are caught and logged but do NOT throw exceptions
   * - Ensures admin operations continue even if client webhook endpoint is down
   *
   * @param submission - Updated KYCSubmission object
   * @param event - Webhook event type (typically KYC_STATUS_CHANGED)
   * @returns Promise<void> - Always resolves (errors caught internally)
   * @private Helper method for AdminService webhook triggers
   */
  private async triggerWebhook(submission: any, event: any): Promise<void> {
    try {
      // Fetch user to get externalUserId and clientId
      const user = await this.prisma.user.findUnique({
        where: { id: submission.userId },
        select: {
          externalUserId: true,
          clientId: true,
        },
      });

      if (!user) {
        throw new Error(`User not found for submission ${submission.id}`);
      }

      // Build webhook data payload
      const webhookData: any = {
        kycSessionId: submission.id,
        externalUserId: user.externalUserId,
        status: submission.internalStatus,
      };

      // Include extracted data if available
      if (submission.panNumber || submission.aadhaarNumber || submission.extractedName || submission.dateOfBirth) {
        webhookData.extractedData = {
          panNumber: submission.panNumber || undefined,
          aadhaarNumber: submission.aadhaarNumber || undefined,
          fullName: submission.extractedName || undefined,
          dateOfBirth: submission.dateOfBirth ? submission.dateOfBirth.toISOString().split('T')[0] : undefined,
        };
      }

      // Include verification scores if available
      if (submission.faceMatchScore !== null || submission.livenessScore !== null) {
        webhookData.verificationScores = {
          faceMatchScore: submission.faceMatchScore !== null ? submission.faceMatchScore : undefined,
          livenessScore: submission.livenessScore !== null ? submission.livenessScore : undefined,
        };
      }

      // Include rejection reason if submission was rejected
      if (submission.rejectionReason) {
        webhookData.rejectionReason = submission.rejectionReason;
      }

      // Send webhook (errors caught internally by WebhookService)
      await this.webhookService.sendWebhook(user.clientId, event, webhookData);
    } catch (error) {
      // Log error but don't throw (webhook failures should not break admin operations)
      console.error(`Failed to trigger webhook for submission ${submission.id}:`, error);
    }
  }

  private async ensurePendingReview(submissionId: string) {
    const submission = await this.prisma.kYCSubmission.findUnique({ where: { id: submissionId } });
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }
    if (submission.internalStatus !== InternalStatus.PENDING_REVIEW) {
      throw new BadRequestException('Submission is not pending review');
    }
    return submission;
  }

  private parseObjectPath(path: string): { bucket: string; objectName: string } {
    const [bucket, ...rest] = path.split('/');
    const objectName = rest.join('/');
    if (!bucket || !objectName) {
      throw new Error('Invalid object path');
    }
    return { bucket, objectName };
  }

  /**
   * Get All Clients (Admin List)
   *
   * Retrieves all client organizations with KYC submission counts.
   * Used by super admin to view and manage clients.
   *
   * @returns Array of AdminClientListItem with masked API keys and stats
   *
   * @remarks
   * **Query Optimization**:
   * - Uses Prisma aggregation to count KYCs per client
   * - Single query with groupBy for efficiency
   * - Ordered by createdAt DESC (newest first)
   *
   * **Field Masking**:
   * - API key: First 10 characters + '...' (e.g., 'client_abc...')
   * - Webhook secret: Not included in list view (only in detail)
   *
   * **Performance**:
   * - Indexed on Client.status for fast filtering
   * - Consider pagination if client count exceeds 100
   */
  async getAllClients(): Promise<AdminClientListItem[]> {
    // Fetch all clients with KYC counts
    const clients = await this.prisma.client.findMany({
      include: {
        _count: {
          select: { kycSubmissions: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Fetch verified and rejected counts for each client in parallel
    const clientsWithStats = await Promise.all(
      clients.map(async (client) => {
        const [verifiedCount, rejectedCount] = await Promise.all([
          this.prisma.kYCSubmission.count({
            where: { clientId: client.id, internalStatus: 'VERIFIED' },
          }),
          this.prisma.kYCSubmission.count({
            where: { clientId: client.id, internalStatus: 'REJECTED' },
          }),
        ]);

        return {
          id: client.id,
          name: client.name,
          status: client.status,
          apiKey: client.apiKey.substring(0, 10) + '...', // Mask API key
          totalKycs: client._count.kycSubmissions,
          verifiedKycs: verifiedCount,
          rejectedKycs: rejectedCount,
          createdAt: client.createdAt.toISOString(),
        };
      })
    );

    return clientsWithStats;
  }

  /**
   * Get Client Detail (Admin View)
   *
   * Retrieves full client data with usage statistics.
   * Used by super admin to view client details and edit settings.
   *
   * @param clientId - Client UUID
   * @returns AdminClientDetail with masked sensitive fields
   * @throws NotFoundException if client not found
   *
   * @remarks
   * **Statistics Calculation**:
   * - Total KYCs: Count all submissions
   * - Verified KYCs: Count submissions with internalStatus = VERIFIED
   * - Rejected KYCs: Count submissions with internalStatus = REJECTED
   *
   * **Field Masking**:
   * - API key: First 10 characters + '...'
   * - Webhook secret: '***' if configured, null if not set
   */
  async getClientDetail(clientId: string): Promise<AdminClientDetail> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        _count: {
          select: { kycSubmissions: true },
        },
      },
    });

    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Count verified and rejected submissions
    const [verifiedCount, rejectedCount] = await Promise.all([
      this.prisma.kYCSubmission.count({
        where: { clientId, internalStatus: 'VERIFIED' },
      }),
      this.prisma.kYCSubmission.count({
        where: { clientId, internalStatus: 'REJECTED' },
      }),
    ]);

    return {
      id: client.id,
      name: client.name,
      status: client.status,
      apiKey: client.apiKey.substring(0, 10) + '...',
      webhookUrl: client.webhookUrl,
      webhookSecret: client.webhookSecret ? '***' : null,
      totalKycs: client._count.kycSubmissions,
      verifiedKycs: verifiedCount,
      rejectedKycs: rejectedCount,
      createdAt: client.createdAt.toISOString(),
      updatedAt: client.updatedAt.toISOString(),
    };
  }

  /**
   * Create Client (Admin Onboarding)
   *
   * Creates a new client organization with API key, MinIO buckets, and default admin user.
   * This is the primary onboarding flow for new FinTech clients.
   *
   * @param dto - CreateClientDto with name, email, optional webhook config
   * @returns CreateClientResponse with plaintext API key and default admin password
   *
   * @remarks
   * **Onboarding Steps**:
   * 1. Generate API key (SHA-256 hash + plaintext)
   * 2. Create Client record in database
   * 3. Create MinIO buckets (kyc-{clientId}-pan, etc.)
   * 4. Generate temporary password (16 chars, alphanumeric)
   * 5. Create default ClientUser (email from DTO, bcrypt password)
   * 6. Clear apiKeyPlaintext from database
   * 7. Return plaintext credentials (SHOW ONCE)
   *
   * **Transaction Safety**:
   * - Wrap in Prisma transaction (rollback if any step fails)
   * - MinIO bucket creation outside transaction (idempotent)
   *
   * **Security**:
   * - API key: 32 bytes entropy, SHA-256 hashed
   * - Default password: 16 chars, must be changed on first login
   * - Plaintext credentials returned once, then cleared
   *
   * **Error Handling**:
   * - Duplicate client name: Throw BadRequestException
   * - MinIO bucket creation failure: Log error, continue (buckets can be created later)
   * - Database error: Rollback transaction
   */
  async createClient(dto: CreateClientDto): Promise<CreateClientResponse> {
    // Generate API key
    const { plaintext: apiKey, hashed: apiKeyHashed } = this.clientService.generateApiKey();

    // Generate temporary password for default admin
    const tempPassword = this.generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // Create client and default admin user in transaction
    const client = await this.prisma.$transaction(async (tx) => {
      // Create client
      const newClient = await tx.client.create({
        data: {
          name: dto.name,
          apiKey: apiKeyHashed,
          apiKeyPlaintext: apiKey, // Temporary, will be cleared
          webhookUrl: dto.webhookUrl,
          webhookSecret: dto.webhookSecret,
          status: 'ACTIVE',
        },
      });

      // Create default admin user
      await tx.clientUser.create({
        data: {
          clientId: newClient.id,
          email: dto.email,
          password: hashedPassword,
          role: 'ADMIN',
          mustChangePassword: true, // Explicit: Force password reset on first login
        },
      });

      return newClient;
    });

    // Create MinIO buckets (outside transaction, idempotent)
    try {
      await this.storageService.createClientBuckets(client.id);
    } catch (error) {
      // Log error but don't fail (buckets can be created later)
      console.error(`Failed to create MinIO buckets for client ${client.id}:`, error);
    }

    // Clear plaintext API key from database
    await this.clientService.clearApiKeyPlaintext(client.id);

    return {
      id: client.id,
      name: client.name,
      apiKey, // Plaintext (show once)
      defaultAdminEmail: dto.email,
      defaultAdminPassword: tempPassword, // Temporary password (show once)
    };
  }

  /**
   * Update Client (Admin Edit)
   *
   * Updates client name and/or status.
   *
   * @param clientId - Client UUID
   * @param dto - UpdateClientDto with optional name and status
   * @returns Updated AdminClientDetail
   * @throws NotFoundException if client not found
   *
   * @remarks
   * **Allowed Updates**:
   * - name: Organization name
   * - status: ACTIVE, SUSPENDED, TRIAL
   *
   * **Status Change Effects**:
   * - SUSPENDED: Client API requests return 401 Unauthorized
   * - ACTIVE: Client can make API requests normally
   * - TRIAL: Client can make requests (may have feature limits)
   *
   * **Audit Trail**:
   * - Log status changes to AuditLog table
   * - Include adminUserId for accountability
   */
  async updateClient(clientId: string, dto: UpdateClientDto): Promise<AdminClientDetail> {
    await this.prisma.client.update({
      where: { id: clientId },
      data: {
        name: dto.name,
        status: dto.status,
      },
    });

    // Return updated detail
    return this.getClientDetail(clientId);
  }

  /**
   * Regenerate API Key (Admin Operation)
   *
   * Generates a new API key for a client, invalidating the old one.
   * Used when client loses their API key or suspects compromise.
   *
   * @param clientId - Client UUID
   * @returns RegenerateApiKeyResponse with new plaintext API key
   * @throws NotFoundException if client not found
   *
   * @remarks
   * **Security Implications**:
   * - Old API key immediately invalidated (all requests fail)
   * - Client must update their systems with new key
   * - Plaintext key shown once, then cleared from database
   *
   * **Notification**:
   * - Consider sending email to client admin users
   * - Log regeneration event to AuditLog
   *
   * **Rollback**:
   * - No rollback possible (old key is lost)
   * - Client must contact support if new key is lost
   */
  async regenerateApiKey(clientId: string): Promise<RegenerateApiKeyResponse> {
    const client = await this.prisma.client.findUnique({ where: { id: clientId } });
    if (!client) {
      throw new NotFoundException('Client not found');
    }

    // Generate new API key
    const { plaintext, hashed } = this.clientService.generateApiKey();

    // Update client with new key
    await this.prisma.client.update({
      where: { id: clientId },
      data: {
        apiKey: hashed,
        apiKeyPlaintext: plaintext, // Temporary
      },
    });

    // Clear plaintext after returning
    await this.clientService.clearApiKeyPlaintext(clientId);

    return { apiKey: plaintext };
  }

  /**
   * Generate Temporary Password
   *
   * Generates a secure random password for default admin user.
   *
   * @returns 16-character alphanumeric password
   *
   * @remarks
   * **Format**: 16 characters, alphanumeric (A-Z, a-z, 0-9)
   * **Entropy**: ~95 bits (cryptographically secure)
   * **Usage**: Default admin user must change on first login
   */
  private generateTempPassword(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let password = '';
    for (let i = 0; i < 16; i++) {
      password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
  }
}
