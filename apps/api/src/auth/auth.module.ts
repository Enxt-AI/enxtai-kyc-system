import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

/**
 * Authentication Module
 * 
 * Provides authentication services for client users.
 * 
 * @remarks
 * **Purpose**:
 * - Client user credential validation (bcrypt password comparison)
 * - User lookup for session management
 * - Integration with NextAuth.js frontend authentication
 * 
 * **Dependencies**:
 * - PrismaModule: Database access for ClientUser queries
 * 
 * **Exports**:
 * - AuthService: Available for use in other modules (if needed)
 * 
 * **Endpoints**:
 * - POST /api/auth/client/login - Client user login
 * 
 * @see {@link AuthService} for authentication logic
 * @see {@link AuthController} for API endpoints
 */
@Module({
  imports: [PrismaModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [AuthService], // Export for potential use in other modules
})
export class AuthModule {}
