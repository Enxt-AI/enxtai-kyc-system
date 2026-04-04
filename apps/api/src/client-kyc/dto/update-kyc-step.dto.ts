import { ApiProperty } from '@nestjs/swagger';
import { IsNumber, IsNotEmpty } from 'class-validator';

export class UpdateKycStepDto {
  @ApiProperty({
    description: 'The progressive UI step the user is currently on (1, 2, 3, 4)',
    example: 1,
  })
  @IsNumber()
  @IsNotEmpty()
  step!: number;
}

