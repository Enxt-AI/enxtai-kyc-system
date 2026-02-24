import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TerminusModule } from '@nestjs/terminus';
import { HttpModule } from '@nestjs/axios';
import { APP_GUARD, APP_FILTER } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { StorageModule } from './storage/storage.module';
import { OcrModule } from './ocr/ocr.module';
import { KycModule } from './kyc/kyc.module';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { ClientModule } from './client/client.module';
import { ClientKycModule } from './client-kyc/client-kyc.module';
import { WebhookModule } from './webhooks/webhook.module';
import { DigiLockerModule } from './digilocker/digilocker.module';
import { TenantMiddleware } from './common/middleware/tenant.middleware';
import { ClientThrottlerGuard } from './common/guards/client-throttler.guard';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

/**
 * App Module
 *
 * Root module of the KYC SaaS application. Configures global middleware,
 * rate limiting, and module imports for multi-tenant architecture.
 *
 * @remarks
 * **Route Strategy**:
 * - `/api/v1/*`: Client-facing APIs (require API key authentication via TenantMiddleware)
 * - `/api/kyc/*`: Internal APIs (used by frontend, no API key required)
 * - `/api/admin/*`: Admin panel APIs (separate authentication in future)
 * - `/api/auth/client/*`: Client user authentication endpoints
 *
 * **Middleware Order**:
 * 1. TenantMiddleware (authentication for /api/v1/* routes)
 * 2. ThrottlerGuard (rate limiting - 100 req/min per client)
 * 3. Route handlers
 *
 * **Rate Limiting**:
 * - 100 requests per minute per client (identified by API key)
 * - Future enhancement: Tiered limits (TRIAL: 10/min, ACTIVE: 100/min, PREMIUM: 1000/min)
 * - 429 Too Many Requests response when quota exceeded
 *
 * **Webhook Infrastructure**:
 * - WebhookModule provides real-time event notifications to client endpoints
 * - Webhooks triggered after document uploads, verification, and status changes
 * - HMAC-SHA256 signed payloads for secure verification
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Structured logging with Pino for production observability
    LoggerModule.forRoot({
      pinoHttp: {
        // Development: pretty print, Production: JSON structured logs
        transport: process.env.NODE_ENV === 'production' ? undefined : {
          target: 'pino-pretty',
          options: {
            colorize: true,
            singleLine: true,
          },
        },
        level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
        // Custom serializers for request context
        serializers: {
          req: (req) => ({
            method: req.method,
            url: req.url,
            clientId: req.clientId,
            userId: req.user?.userId || req.userId,
            action: `${req.method} ${req.url}`,
          }),
          res: (res) => ({
            statusCode: res.statusCode,
          }),
        },
        // Include response time/duration in log object
        customSuccessMessage: function (req, res) {
          return `${req.method} ${req.url} ${res.statusCode}`;
        },
        customAttributeKeys: {
          req: 'request',
          res: 'response',
          err: 'error',
          responseTime: 'duration',
        },
        autoLogging: true, // Log all HTTP requests with response times
        customLogLevel: function (req, res, err) {
          if (res.statusCode >= 400 && res.statusCode < 500) {
            return 'warn';
          } else if (res.statusCode >= 500 || err) {
            return 'error';
          }
          return 'info';
        },
      },
    }),
    // Rate limiting: 100 requests per minute per client
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests per minute per client
      },
    ]),
    TerminusModule,
    HttpModule,
    HealthModule,
    PrismaModule,
    StorageModule,
    OcrModule,
    KycModule,
    AdminModule,
    AuthModule, // Client user authentication
    ClientKycModule, // Client-facing KYC APIs at /v1/kyc/* (protected by TenantMiddleware)
    ClientModule,
    WebhookModule, // Webhook delivery infrastructure for event notifications
    DigiLockerModule, // DigiLocker OAuth 2.0 integration for document fetching
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // Global rate limiting guard (per-client, not per-IP)
    {
      provide: APP_GUARD,
      useClass: ClientThrottlerGuard,
    },
    // Global exception filter for standardized error responses
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  /**
   * Middleware Configuration
   *
   * Registers TenantMiddleware for client-facing API routes (/api/v1/*).
   * Internal routes (/api/kyc/*, /api/admin/*) remain unprotected for backward compatibility.
   *
   * @remarks
   * **Route Strategy**:
   * - `/api/v1/*`: Client-facing APIs (require API key authentication)
   * - `/api/kyc/*`: Internal APIs (used by frontend, no API key required)
   * - `/api/admin/*`: Admin panel APIs (separate authentication in future)
   *
   * **Middleware Order**:
   * 1. TenantMiddleware (authentication)
   * 2. ThrottlerGuard (rate limiting)
   * 3. Route handlers
   *
   * @remarks
   * TenantMiddleware is applied to /v1/kyc/* routes only.
   * Client portal routes (/v1/client/*) use SessionAuthGuard instead.
   */
  configure(consumer: MiddlewareConsumer) {
    // Use named parameter :path* for path-to-regexp v8+ compatibility
    // This ensures all nested paths under /v1/kyc/ are matched
    consumer
      .apply(TenantMiddleware)
      .forRoutes(
        { path: 'v1/kyc/validate', method: RequestMethod.ALL },
        { path: 'v1/kyc/initiate', method: RequestMethod.ALL },
        { path: 'v1/kyc/upload/:type', method: RequestMethod.ALL },
        { path: 'v1/kyc/upload/:type/:subtype', method: RequestMethod.ALL },
        { path: 'v1/kyc/upload/signature', method: RequestMethod.ALL },
        { path: 'v1/kyc/delete/:type', method: RequestMethod.ALL },
        { path: 'v1/kyc/delete/:type/:subtype', method: RequestMethod.ALL },
        { path: 'v1/kyc/status/:id', method: RequestMethod.ALL },
        { path: 'v1/kyc/verify', method: RequestMethod.ALL },
        { path: 'v1/kyc/:submissionId/digilocker/initiate', method: RequestMethod.ALL },
        { path: 'v1/kyc/:submissionId/digilocker/fetch', method: RequestMethod.ALL },
        { path: 'v1/kyc/:submissionId/digilocker/status', method: RequestMethod.ALL },
      );
  }
}

