import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InternalStatus, FinalStatus } from '@enxtai/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
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

    return updated;
  }

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
}
