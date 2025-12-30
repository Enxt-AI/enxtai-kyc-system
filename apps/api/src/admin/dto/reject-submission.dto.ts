import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class RejectSubmissionDto {
  @IsUUID()
  submissionId!: string;

  @IsUUID()
  adminUserId!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;
}
