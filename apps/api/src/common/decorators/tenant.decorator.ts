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
    return request.client;
  },
);
