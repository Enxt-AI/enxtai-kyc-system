import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

/**
 * Client Decorator
 *
 * Extracts the authenticated client from the request context. Must be used on routes
 * protected by TenantMiddleware (typically /api/v1/* routes).
 *
 * @remarks
 * - Middleware injects `req.client` and `req.clientId` after API key validation
 * - Returns the full Client object from database (includes webhookUrl, config, etc.)
 * - Throws UnauthorizedException if client not found (middleware should prevent this)
 *
 * **NestJS + Fastify Note**:
 * When using Fastify adapter, NestJS's ExecutionContext returns a wrapper object,
 * not the raw Fastify request. Middleware sets properties on `req.raw` (the underlying
 * Node.js IncomingMessage), so we need to check both locations.
 *
 * @example
 * ```typescript
 * @Get('status')
 * async getStatus(@Client() client: ClientEntity) {
 *   return { clientId: client.id, name: client.name };
 * }
 * ```
 */
export const Client = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<FastifyRequest>();

    // 1. Direct property (standard NestJS behavior)
    if (request.client) {
      return request.client;
    }

    // 2. From raw request (Fastify adapter - middleware sets on underlying request)
    const rawRequest = request.raw as any;
    if (rawRequest?.client) {
      return rawRequest.client;
    }

    return undefined;
  },
);
