import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { MlClientService } from './ml-client.service';

@Module({
  imports: [ConfigModule, HttpModule],
  providers: [MlClientService],
  exports: [MlClientService],
})
export class MlClientModule {}
