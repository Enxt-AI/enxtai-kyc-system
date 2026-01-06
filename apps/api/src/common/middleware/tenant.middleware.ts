import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ClientService } from '../../client/client.service';

/**
 * Tenant Middleware
 *
 * Authenticates API requests using API keys and injects tenant context into the request object.
 * Applied to all client-facing API routes (/api/v1/*) to enforce multi-tenancy isolation.
 *
 * @remarks
 * **Authentication Flow**:
 * 1. Extract `X-API-Key` header from request
 * 2. Hash API key with SHA-256 and lookup Client in database
 * 3. Validate client status is ACTIVE
 * 4. Inject `req.clientId` and `req.client` for downstream use
 * 5. Proceed to route handler
 *
 * **Security Considerations**:
 * - API keys are hashed before database lookup (never store plaintext)
 * - Inactive/suspended clients are rejected (status check)
 * - Failed authentication attempts are logged for monitoring
 * - Rate limiting applied per client (see ThrottlerGuard configuration)
 *
 * **Middleware Lifecycle**:
 * - Registered in AppModule for `/api/v1/*` routes only
 * - Executes before route handlers and guards
 * - Does not apply to internal routes (/api/kyc/*, /api/admin/*)
 *
 * **Error Responses**:
 * - Missing API key: 401 Unauthorized "API key required"
 * - Invalid/inactive key: 401 Unauthorized "Invalid or inactive API key"
 * - Rate limit exceeded: 429 Too Many Requests (ThrottlerGuard)
 *
 * **Logging Strategy**:
 * - Failed authentication attempts logged with IP address and timestamp
 * - Successful authentication logged at debug level only
 * - Helps identify brute force attacks or misconfigured clients
 *
 * @example
 * ```typescript
 * // Client makes request with API key
 * fetch('/api/v1/kyc/initiate', {
 *   headers: { 'X-API-Key': 'client_abc123...' }
 * });
 *
 * // Middleware injects tenant context
 * @Post('initiate')
 * async initiate(@Client() client: ClientEntity) {
 *   // client.id, client.name, client.config available here
 * }
 * ```
 *
 * @see {@link ClientService.validateApiKey} for authentication logic
 * @see {@link Client} decorator for extracting tenant from request
 */
@Injectable()
export class TenantMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TenantMiddleware.name);

  constructor(private readonly clientService: ClientService) {}

  /**
   * Middleware Execution Handler
   *
   * Processes incoming requests to extract and validate API keys, then injects
   * tenant context into the request object for downstream route handlers.
   *
   * @param req Fastify request object (will be augmented with clientId and client)
   * @param res Fastify response object (unused, required by NestMiddleware interface)
   * @param next Callback to proceed to next middleware/route handler
   *
   * @throws {UnauthorizedException} If X-API-Key header is missing
   * @throws {UnauthorizedException} If API key is invalid or client is inactive
   *
   * @remarks
   * **Request Augmentation**:
   * - `req.clientId`: UUID of authenticated client
   * - `req.client`: Full Client object (includes name, config, webhookUrl, etc.)
   *
   * **Type Safety**:
   * - FastifyRequest extended via module augmentation (see fastify.d.ts)
   * - TypeScript knows about clientId and client properties
   * - Controllers can safely access these properties via @Client() decorator
   *
   * **Performance Considerations**:
   * - Single database query per request (lookup by hashed API key)
   * - Result not cached (ensures real-time status validation)
   * - Consider Redis caching for high-traffic scenarios (future enhancement)
   *
   * @example
   * ```typescript
   * // Before middleware: req.clientId = undefined, req.client = undefined
   * // After middleware: req.clientId = "uuid", req.client = { id, name, ... }
   * ```
   */
  async use(
    req: FastifyRequest,
    res: FastifyReply,
    next: () => void,
  ): Promise<void> {
    // Extract API key from header
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      this.logger.warn(
        `Missing API key from ${req.ip} for ${req.method} ${req.url}`,
      );
      throw new UnauthorizedException('API key required');
    }

    // Validate API key and get client
    const client = await this.clientService.validateApiKey(apiKey);

    if (!client) {
      this.logger.warn(
        `Invalid or inactive API key from ${req.ip} for ${req.method} ${req.url}`,
      );
      throw new UnauthorizedException('Invalid or inactive API key');
    }

    // Inject tenant context into request
    req.clientId = client.id;
    req.client = client;

    this.logger.debug(
      `Authenticated client ${client.name} (${client.id}) for ${req.method} ${req.url}`,
    );

    // Proceed to route handler
    next();
  }
}
