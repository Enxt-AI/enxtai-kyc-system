import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

/**
 * Authentication Module
 * 
 * Provides authentication services for client clientUsers.
 * 
 * @remarks
 * **Purpose**:
 * - Client clientUser credential validation (bcrypt password comparison)
 * - ClientUser lookup for session management
 * - Integration with NextAuth.js frontend authentication
 * 
 * **Dependencies**:
 * - PrismaModule: Database access for User queries
 * 
 * **Exports**:
 * - AuthService: Available for use in other modules (if needed)
 * 
 * **Endpoints**:
 * - POST /api/auth/client/login - Client clientUser login
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
