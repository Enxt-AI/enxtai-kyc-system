import { IsUUID } from 'class-validator';

export class ProcessDigiLockerDocumentsDto {
  @IsUUID()
  submissionId!: string;
}