import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import multipart from '@fastify/multipart';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';

/**
 * Pino Logger Configuration
 *
 * Structured logging with request context for production observability.
 *
 * @remarks
 * **Log Levels**:
 * - Development: debug (verbose output with pretty printing)
 * - Production: info (JSON format for log aggregation)
 *
 * **Request Context**:
 * - clientId: Tenant identifier (from TenantMiddleware)
 * - userId: End-user identifier
 * - method: HTTP method (GET, POST, etc.)
 * - url: Request path
 * - statusCode: Response status
 * - duration: Request processing time (ms)
 *
 * **Log Aggregation**:
 * - JSON format compatible with ELK Stack, CloudWatch, Datadog
 * - Structured fields enable efficient querying and alerting
 *
 * @example
 * ```typescript
 * this.logger.log({
 *   action: 'kyc_initiated',
 *   clientId: req.clientId,
 *   userId: dto.externalUserId,
 *   metadata: { email: dto.email }
 * });
 * ```
 */
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
    { bufferLogs: true },
  );

  // Configure Pino logger
  app.useLogger(app.get(Logger));

  // Register multipart for file uploads
  await app.register(multipart, {
    limits: {
      fileSize: 10 * 1024 * 1024, // 10MB
    },
  });

  // Configure CORS with explicit methods for Fastify
  app.enableCors({
    origin: true, // Allow all origins (use specific origins in production)
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Requested-With'],
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  // Swagger/OpenAPI Configuration
  const config = new DocumentBuilder()
    .setTitle('EnxtAI KYC API')
    .setDescription('REST API for automated KYC verification. Supports document upload (PAN, Aadhaar), OCR extraction, face verification, and webhook notifications.')
    .setVersion('1.0')
    .addServer('http://localhost:3001', 'Development')
    .addServer('https://api.enxtai.com', 'Production')
    .addApiKey(
      { type: 'apiKey', name: 'X-API-Key', in: 'header' },
      'api-key'
    )
    .addTag('KYC', 'KYC verification endpoints')
    .addTag('Webhooks', 'Webhook configuration')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document, {
    customSiteTitle: 'EnxtAI KYC API Documentation',
    customCss: '.swagger-ui .topbar { display: none }',
  });

  const port = Number(process.env.PORT) || 3001;
  await app.listen(port, '0.0.0.0');
  console.log(`KYC API is running on http://localhost:${port}`);
  console.log(`Swagger UI available at http://localhost:${port}/api/docs`);
}

bootstrap();
