import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class UploadPanDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  userId!: string;
}

export class UploadAadhaarDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  userId!: string;
}

export class UploadLivePhotoDto {
  @IsString()
  @IsUUID()
  @IsNotEmpty()
  userId!: string;
}
