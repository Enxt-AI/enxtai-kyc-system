import { IsString, IsArray, IsUUID, ArrayNotEmpty } from 'class-validator';

export class FetchDigiLockerDocumentsDto {
  @IsUUID()
  userId!: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  documentTypes!: string[];
}