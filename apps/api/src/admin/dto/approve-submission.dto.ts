import { IsOptional, IsString, IsUUID } from 'class-validator';

export class ApproveSubmissionDto {
  @IsUUID()
  submissionId!: string;

  @IsUUID()
  adminUserId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
