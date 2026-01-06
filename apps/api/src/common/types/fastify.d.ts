/**
 * Fastify Type Augmentation
 *
 * Extends Fastify's FastifyRequest interface to include tenant context properties
 * injected by TenantMiddleware. Enables type-safe access to client information
 * in route handlers.
 */
import 'fastify';
import { Client } from '@prisma/client';

declare module 'fastify' {
  interface FastifyRequest {
    /** Authenticated client ID (UUID) injected by TenantMiddleware */
    clientId?: string;
    /** Full Client object from database injected by TenantMiddleware */
    client?: Client;
  }
}
