import { Body, Controller, Get, HttpException, HttpStatus, Param, Post } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ApproveSubmissionDto } from './dto/approve-submission.dto';
import { RejectSubmissionDto } from './dto/reject-submission.dto';

@Controller('admin/kyc')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('pending-review')
  async getPendingReviews() {
    return this.adminService.getPendingReviews();
  }

  @Get('submission/:id')
  async getSubmission(@Param('id') id: string) {
    return this.adminService.getSubmissionWithPresignedUrls(id);
  }

  @Post('approve')
  async approve(@Body() dto: ApproveSubmissionDto) {
    try {
      const submission = await this.adminService.approveSubmission(dto.submissionId, dto.adminUserId, dto.notes);
      return { success: true, submissionId: submission.id };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Approval failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  @Post('reject')
  async reject(@Body() dto: RejectSubmissionDto) {
    try {
      const submission = await this.adminService.rejectSubmission(dto.submissionId, dto.adminUserId, dto.reason);
      return { success: true, submissionId: submission.id };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      throw new HttpException(err?.message ?? 'Rejection failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }
}
