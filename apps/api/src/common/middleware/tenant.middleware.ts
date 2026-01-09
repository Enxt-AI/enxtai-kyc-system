import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { FastifyRequest, FastifyReply } from 'fastify';
import { ClientService } from '../../client/client.service';
import { Client } from '@prisma/client';

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
 * 4. **Validate request domain against client's allowedDomains whitelist** (NEW)
 * 5. Inject `req.clientId` and `req.client` for downstream use
 * 6. Proceed to route handler
 *
 * **Domain Whitelisting** (NEW):
 * - Extracts origin from `Origin`, `Host`, or `Referer` headers
 * - Matches against `client.allowedDomains` array (exact or wildcard)
 * - Supports wildcards: `*.domain.com` matches subdomains
 * - Dev domains always whitelisted: `localhost:3000`, `127.0.0.1:3000`
 * - Empty whitelist = allow all (backward compatibility)
 * - Rejects with 403 Forbidden if domain not whitelisted
 *
 * **Security Considerations**:
 * - API keys are hashed before database lookup (never store plaintext)
 * - Inactive/suspended clients are rejected (status check)
 * - Domain validation prevents API key abuse from unauthorized sites
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
 * - Domain not whitelisted: 403 Forbidden "Domain not whitelisted" (NEW)
 * - Rate limit exceeded: 429 Too Many Requests (ThrottlerGuard)
 *
 * **Logging Strategy**:
 * - Failed authentication attempts logged with IP address and timestamp
 * - Domain validation failures logged with client name and origin
 * - Successful authentication logged at debug level only
 * - Helps identify brute force attacks or misconfigured clients
 *
 * @example
 * ```typescript
 * // Client makes request with API key from whitelisted domain
 * fetch('https://yourkyc.com/api/v1/kyc/initiate', {
 *   headers: {
 *     'X-API-Key': 'client_abc123...',
 *     'Origin': 'https://fintech.com' // Must be in client.allowedDomains
 *   }
 * });
 *
 * // Middleware validates API key + domain, then injects tenant context
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
    // Skip CORS preflight requests - they don't carry X-API-Key header
    // CORS middleware handles OPTIONS requests before this middleware
    if (req.method === 'OPTIONS') {
      return next();
    }

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

    // **NEW: Validate request domain against client whitelist**
    if (!this.validateDomain(req, client)) {
      this.logger.warn(
        `Domain not whitelisted for client ${client.name} (${client.id}) from ${req.ip} for ${req.method} ${req.url}`,
      );
      throw new ForbiddenException('Domain not whitelisted');
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

  /**
   * Validate Request Domain Against Client Whitelist
   *
   * Checks if the request origin matches any domain in the client's allowedDomains
   * configuration. Supports exact matching and wildcard patterns (*.domain.com).
   *
   * @param req Fastify request object (for extracting origin headers)
   * @param client Client object with allowedDomains configuration
   * @returns true if domain is whitelisted, false otherwise
   *
   * @remarks
   * **Domain Extraction Priority**:
   * 1. `Origin` header (CORS requests, most reliable)
   * 2. `Host` header (fallback for non-CORS requests)
   * 3. `Referer` header (last resort, can be spoofed)
   *
   * **Wildcard Matching**:
   * - `*.domain.com` matches `sub.domain.com`, `api.domain.com`, etc.
   * - Does NOT match `domain.com` itself (subdomain required)
   * - Uses regex pattern: `^[a-zA-Z0-9-]+\.domain\.com$`
   *
   * **Development/Local Testing**:
   * - Dev domains (localhost, 127.0.0.1) must be explicitly added to allowedDomains
   * - Add "localhost:3000" and "127.0.0.1:3000" to whitelist for local testing
   * - This ensures domain validation is properly tested before production
   *
   * **Empty Whitelist Behavior**:
   * - If `allowedDomains` is null or empty array → Allow all domains
   * - Rationale: Backward compatibility for existing clients
   * - Clients must explicitly configure domains to enforce restrictions
   *
   * **Security Considerations**:
   * - Origin header can be omitted by non-browser clients (Postman, cURL)
   * - Host header is more reliable but can be spoofed
   * - Combine with API key authentication for defense-in-depth
   * - Log all validation failures for security monitoring
   *
   * @example
   * ```typescript
   * // Exact match
   * client.allowedDomains = ["fintech.com", "localhost:3000"];
   * validateDomain(req, client); // true if Origin: https://fintech.com
   *
   * // Wildcard match
   * client.allowedDomains = ["*.smcwealth.com"];
   * validateDomain(req, client); // true if Origin: https://api.smcwealth.com
   *
   * // Empty whitelist (no restrictions)
   * client.allowedDomains = []; // or null
   * validateDomain(req, client); // true for any domain
   * ```
   */
  private validateDomain(req: FastifyRequest, client: Client): boolean {
    // Extract origin from headers (priority: Origin > Host > Referer)
    const origin = req.headers.origin || req.headers.host || req.headers.referer;

    if (!origin) {
      this.logger.warn(`No origin header found for ${req.method} ${req.url}`);
      return false; // Reject if no origin can be determined
    }

    // Parse domain from origin (remove protocol and path)
    const domain = this.extractDomain(origin);

    // If no allowedDomains configured, allow all (backward compatibility)
    // NOTE: Clients MUST configure allowedDomains to enforce domain restrictions
    if (!client.allowedDomains || (Array.isArray(client.allowedDomains) && client.allowedDomains.length === 0)) {
      this.logger.debug(`No domain restrictions for client ${client.name} - allowing all`);
      return true;
    }

    // Check against allowedDomains (exact match or wildcard)
    // Dev domains (localhost, 127.0.0.1) must be explicitly added to whitelist
    const allowedDomains = client.allowedDomains as string[];
    for (const allowedDomain of allowedDomains) {
      if (this.matchDomain(domain, allowedDomain)) {
        this.logger.debug(`Domain ${domain} matched whitelist: ${allowedDomain}`);
        return true;
      }
    }

    // No match found
    this.logger.warn(`Domain ${domain} not whitelisted for client ${client.name}`);
    return false;
  }

  /**
   * Extract Domain from Origin Header
   *
   * Parses origin/host/referer header to extract clean domain with port.
   *
   * @param origin Raw header value (e.g., "https://api.fintech.com:443/path")
   * @returns Clean domain (e.g., "api.fintech.com" or "localhost:3000")
   *
   * @remarks
   * **Parsing Logic**:
   * - Remove protocol (http://, https://)
   * - Remove path (/api/v1/kyc)
   * - Keep port if non-standard (e.g., :3000, :8080)
   * - Remove standard ports (:80, :443)
   *
   * @example
   * ```typescript
   * extractDomain("https://api.fintech.com/path") // "api.fintech.com"
   * extractDomain("http://localhost:3000") // "localhost:3000"
   * extractDomain("api.fintech.com:443") // "api.fintech.com"
   * ```
   */
  private extractDomain(origin: string): string {
    // Remove protocol
    let domain = origin.replace(/^https?:\/\//, '');

    // Remove path (everything after first /)
    domain = domain.split('/')[0];

    // Remove standard ports
    domain = domain.replace(/:80$/, '').replace(/:443$/, '');

    return domain;
  }

  /**
   * Match Domain Against Whitelist Pattern
   *
   * Checks if a domain matches a whitelist entry, supporting wildcard patterns and subdomain matching.
   *
   * @param domain Request domain (e.g., "api.fintech.com")
   * @param pattern Whitelist pattern (e.g., "*.fintech.com" or "fintech.com")
   * @returns true if domain matches pattern
   *
   * @remarks
   * **Matching Rules**:
   * - Exact match: "fintech.com" matches "fintech.com"
   * - Subdomain match: "fintech.com" matches "api.fintech.com", "portal.fintech.com"
   * - Wildcard: "*.fintech.com" matches "api.fintech.com", "portal.fintech.com"
   * - Wildcard does NOT match root: "*.fintech.com" does NOT match "fintech.com"
   * - Case-insensitive matching
   *
   * **Wildcard Implementation**:
   * - Replace `*.` with regex pattern `[a-zA-Z0-9-]+\.`
   * - Escape dots in domain name
   * - Match full string (^...$)
   *
   * **Subdomain Suffix Matching**:
   * - Non-wildcard patterns match both exact and subdomains via endsWith
   * - "fintech.com" matches "api.fintech.com" via `.fintech.com` suffix check
   *
   * @example
   * ```typescript
   * matchDomain("api.fintech.com", "*.fintech.com") // true (wildcard)
   * matchDomain("fintech.com", "*.fintech.com") // false (wildcard no root)
   * matchDomain("fintech.com", "fintech.com") // true (exact)
   * matchDomain("api.fintech.com", "fintech.com") // true (subdomain suffix)
   * matchDomain("portal.fintech.com", "fintech.com") // true (subdomain suffix)
   * matchDomain("API.fintech.com", "*.fintech.com") // true (case-insensitive)
   * ```
   */
  private matchDomain(domain: string, pattern: string): boolean {
    // Case-insensitive comparison
    domain = domain.toLowerCase();
    pattern = pattern.toLowerCase();

    // Exact match
    if (domain === pattern) {
      return true;
    }

    // Wildcard match
    if (pattern.startsWith('*.')) {
      const baseDomain = pattern.substring(2); // Remove "*."
      // Check if domain ends with baseDomain and has a subdomain
      const regex = new RegExp(`^[a-zA-Z0-9-]+\\.${baseDomain.replace(/\./g, '\\.')}$`);
      return regex.test(domain);
    }

    // Subdomain suffix match for non-wildcard patterns
    // Allows "fintech.com" pattern to match "api.fintech.com" subdomains
    if (domain.endsWith(`.${pattern}`)) {
      return true;
    }

    return false;
  }
}
