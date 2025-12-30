import { IsNotEmpty, IsUUID } from 'class-validator';

export class ExtractPanDto {
  @IsUUID()
  @IsNotEmpty()
  submissionId!: string;
}

export class ExtractAadhaarDto {
  @IsUUID()
  @IsNotEmpty()
  submissionId!: string;
}
