import { IsEnum, IsNotEmpty, IsString, IsUUID } from 'class-validator';
import { DocumentSource } from '@enxtai/shared-types';

export class CreateKYCSubmissionDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  userId!: string;

  @IsEnum(DocumentSource)
  documentSource: DocumentSource = DocumentSource.MANUAL_UPLOAD;
}
