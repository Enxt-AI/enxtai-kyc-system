import { IsUUID } from 'class-validator';

export class VerifyFaceDto {
  @IsUUID()
  submissionId!: string;
}
