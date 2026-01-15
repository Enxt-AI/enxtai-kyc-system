import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { DigiLockerConfigService } from './digilocker.config';
import { DigiLockerAuthService } from './digilocker-auth.service';
import { DigiLockerDocumentService } from './digilocker-document.service';
import { DigiLockerAuthController } from './digilocker-auth.controller';

/**
 * DigiLocker Integration Module
 *
 * Provides DigiLocker OAuth 2.0 authentication and document fetching capabilities.
 * Enables users to fetch KYC documents directly from their DigiLocker accounts.
 *
 * @remarks
 * ## Purpose
 * Integrates with DigiLocker API (via API Setu) to:
 * - Authenticate users via OAuth 2.0 flow
 * - Fetch PAN and Aadhaar documents from DigiLocker
 * - Extract demographic data from Aadhaar XML
 * - Store fetched documents in MinIO for OCR processing
 *
 * ## Dependencies
 * - **ConfigModule**: Load DigiLocker credentials from environment
 * - **HttpModule**: HTTP client for DigiLocker API requests (axios)
 * - **PrismaModule**: Database access for storing OAuth tokens
 *
 * ## Exports
 * - **DigiLockerConfigService**: Configuration service for other modules
 *
 * ## Integration Points
 * This module will be imported by:
 * - `KycModule`: Trigger DigiLocker fetch during KYC workflow
 * - `ClientKycModule`: Expose DigiLocker endpoints to external clients
 *
 * ## Security Features
 * - OAuth 2.0 authorization code flow (most secure)
 * - Tokens stored encrypted in database
 * - Automatic token refresh before expiry
 * - HTTPS-only communication with DigiLocker
 *
 * @see DigiLockerConfigService for configuration details
 * @see DigiLockerAuthService for OAuth implementation (Phase 2)
 * @see DigiLockerDocumentService for document fetching (Phase 3)
 */
@Module({
  imports: [
    ConfigModule,   // Provides ConfigService for environment variables
    HttpModule,     // Provides HttpService for API requests
    PrismaModule,   // Provides PrismaService for database access
    StorageModule,  // Provides StorageService for MinIO uploads
  ],
  controllers: [DigiLockerAuthController],
  providers: [DigiLockerConfigService, DigiLockerAuthService, DigiLockerDocumentService],
  exports: [DigiLockerConfigService, DigiLockerAuthService, DigiLockerDocumentService], // Export for use in other modules
})
export class DigiLockerModule {}