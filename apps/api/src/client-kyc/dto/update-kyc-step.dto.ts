import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class UpdateKycStepDto {
  @ApiProperty({
    description: 'The progressive UI step the user is currently on (e.g. upload, photo, signature, verify)',
    example: 'photo',
  })
  @IsString()
  @IsNotEmpty()
  step!: string;
}

