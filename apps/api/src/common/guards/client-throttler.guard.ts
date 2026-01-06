import { Injectable, ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { FastifyRequest } from 'fastify';

/**
 * Client Throttler Guard
 *
 * Custom rate limiting guard that tracks requests per client instead of per IP address.
 * Extends the default ThrottlerGuard to use clientId from TenantMiddleware for tenant-aware
 * rate limiting.
 *
 * @remarks
 * **Rate Limiting Strategy**:
 * - Uses `req.clientId` (injected by TenantMiddleware) as the tracker key
 * - Falls back to IP address for unauthenticated routes
 * - Enforces 100 requests per minute per client
 *
 * **Tracker Key Logic**:
 * - If `req.clientId` exists: Use clientId (tenant-specific limit)
 * - If `req.clientId` is null: Use IP address (pre-authentication requests)
 *
 * **Integration**:
 * - Registered globally via APP_GUARD in AppModule
 * - Executes after TenantMiddleware (which injects clientId)
 * - Works with ThrottlerModule configuration (ttl: 60s, limit: 100)
 *
 * **Future Enhancements**:
 * - Tiered limits based on client.status (TRIAL: 10/min, ACTIVE: 100/min, PREMIUM: 1000/min)
 * - Custom limits per client stored in client.config JSON field
 * - Redis storage for distributed rate limiting
 *
 * @example
 * ```typescript
 * // Client A makes 100 requests → Rate limited
 * // Client B makes 100 requests → Not affected (separate quota)
 * // Unauthenticated request → IP-based rate limiting
 * ```
 *
 * @see {@link TenantMiddleware} for clientId injection
 * @see {@link ThrottlerModule} for rate limit configuration
 */
@Injectable()
export class ClientThrottlerGuard extends ThrottlerGuard {
  /**
   * Get Tracker Identifier
   *
   * Overrides the default tracker method to use clientId instead of IP address.
   * This ensures rate limits are applied per tenant rather than per source IP.
   *
   * @param req Fastify request object (with clientId injected by TenantMiddleware)
   * @returns Client UUID if authenticated, IP address otherwise
   *
   * @remarks
   * **Execution Context**:
   * - Called after TenantMiddleware for `/api/v1/*` routes
   * - Called before TenantMiddleware for other routes (fallback to IP)
   *
   * **Tracker Key Examples**:
   * - Authenticated: `"550e8400-e29b-41d4-a716-446655440000"` (client UUID)
   * - Unauthenticated: `"192.168.1.100"` (IP address)
   *
   * **Why Per-Client?**:
   * - Prevents one client from exhausting shared IP quota (e.g., NAT gateway)
   * - Enables per-tenant SLA enforcement
   * - Supports tiered pricing based on usage limits
   *
   * @example
   * ```typescript
   * // After TenantMiddleware:
   * // req.clientId = "550e8400-e29b-41d4-a716-446655440000"
   * // Tracker returns: "550e8400-e29b-41d4-a716-446655440000"
   *
   * // Before TenantMiddleware (e.g., /api/kyc/* routes):
   * // req.clientId = undefined
   * // Tracker returns: "192.168.1.100" (req.ip)
   * ```
   */
  protected async getTracker(req: FastifyRequest): Promise<string> {
    // Use clientId if available (tenant-aware), otherwise fall back to IP
    return req.clientId || req.ip;
  }
}
