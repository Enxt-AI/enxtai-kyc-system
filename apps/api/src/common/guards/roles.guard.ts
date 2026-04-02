import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Roles Guard
 *
 * Enforces role-based access control (RBAC) on protected endpoints.
 *
 * @remarks
 * **Purpose**:
 * Restricts endpoint access based on clientUser roles defined via @Roles decorator.
 * Must be used in combination with SessionAuthGuard.
 *
 * **Usage**:
 * ```typescript
 * @UseGuards(SessionAuthGuard, RolesGuard)
 * @Roles('SUPER_ADMIN')
 * @Post('clients')
 * async createClient() {}
 * ```
 *
 * **Authorization Flow**:
 * 1. Reads roles from @Roles decorator metadata
 * 2. Retrieves clientUser role from request.clientUser (set by SessionAuthGuard)
 * 3. Checks if clientUser's role matches any required roles
 * 4. Allows access if role matches, otherwise throws 403 Forbidden
 *
 * **Role Sources**:
 * - For client portal clientUsers: ClientUserRole (ADMIN, VIEWER)
 * - For super admins: role field set to 'SUPER_ADMIN' in session token
 *
 * **Security**:
 * - Requires SessionAuthGuard to run first (sets request.clientUser)
 * - Uses case-sensitive role matching
 * - Returns 403 Forbidden (not 401) to indicate authorization failure
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // No roles required, allow access
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const clientUser = request.clientUser;

    // ClientUser should be set by SessionAuthGuard
    if (!clientUser || !clientUser.role) {
      throw new ForbiddenException('Access denied: No role information found');
    }

    // Check if clientUser's role matches any of the required roles
    const hasRole = requiredRoles.includes(clientUser.role);
    if (!hasRole) {
      throw new ForbiddenException(`Access denied: Requires one of [${requiredRoles.join(', ')}] roles`);
    }

    return true;
  }
}
