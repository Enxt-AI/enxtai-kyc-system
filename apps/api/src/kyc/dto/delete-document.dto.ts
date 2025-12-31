import { IsOptional, IsString, IsUUID } from 'class-validator';

export class DeleteDocumentDto {
  @IsUUID()
  userId!: string;

  @IsOptional()
  @IsUUID()
  submissionId?: string;
}
