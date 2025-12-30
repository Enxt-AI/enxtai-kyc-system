import { IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { Transform } from 'class-transformer';

export class UploadPanDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  @Transform(({ value }) => value?.trim())
  userId?: string;
}

export class UploadAadhaarDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  @Transform(({ value }) => value?.trim())
  userId?: string;
}

export class UploadLivePhotoDto {
  @IsOptional()
  @IsString()
  @IsUUID()
  @Transform(({ value }) => value?.trim())
  userId?: string;
}
