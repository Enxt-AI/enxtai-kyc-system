import { Module } from '@nestjs/common';
import { ClientKycController } from './client-kyc.controller';
import { ClientKycService } from './client-kyc.service';
import { PrismaModule } from '../prisma/prisma.module';
import { KycModule } from '../kyc/kyc.module';
import { ClientModule } from '../client/client.module';

/**
 * Client KYC Module
 *
 * Organizes client-facing KYC API components with multi-tenant architecture.
 * Provides REST endpoints at `/v1/kyc/*` for FinTech integrators to verify
 * their end-users' identities.
 *
 * **Module Architecture:**
 * - Controller: REST endpoints at `/v1/kyc/*` (protected by TenantMiddleware)
 * - Service: Tenant-aware wrapper around KycService with external user ID mapping
 * - Dependencies: PrismaModule (database), KycModule (core logic), ClientModule (auth)
 *
 * **Multi-Tenancy Strategy:**
 * - TenantMiddleware intercepts `/v1/*` routes (configured in AppModule)
 * - Validates X-API-Key header and injects clientId into request context
 * - ClientKycService enforces tenant isolation on all database queries
 * - Documents stored in client-specific MinIO buckets (kyc-{clientId}-{suffix})
 *
 * **Integration Points:**
 * - `KycModule`: Provides KycService for core verification logic
 * - `ClientModule`: Provides ClientService for API key validation
 * - `PrismaModule`: Provides PrismaService for database access
 *
 * **Exported Services:**
 * - ClientKycService (for potential use by webhook or background job modules)
 *
 * @see {@link ClientKycController} for REST endpoints
 * @see {@link ClientKycService} for business logic
 * @see {@link TenantMiddleware} for authentication
 */
@Module({
  imports: [
    PrismaModule,
    KycModule,
    ClientModule,
  ],
  controllers: [ClientKycController],
  providers: [ClientKycService],
  exports: [ClientKycService],
})
export class ClientKycModule {}
