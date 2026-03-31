import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { randomBytes, createHash } from 'crypto';

const prisma = new PrismaClient();

/**
 * Database Seed Script
 *
 * Seeds the database with:
 * 1. SUPER_ADMIN: Platform administrator (admin@enxtai.com) with null clientId
 * 2. Demo Client: TestFinTech organization for end-to-end testing
 * 3. Demo ClientUser: admin@testfintech.com for client portal access
 * 4. Password Reset: All demo accounts require password change on first login
 *
 * ⚠️ SECURITY WARNING:
 * - Change all passwords before production deployment
 * - Remove demo client and user (TestFinTech, admin@testfintech.com) in production
 * - Regenerate API keys for production clients
 */
async function main() {
  console.log('🌱 Seeding database...');

  // Create super admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.clientUser.upsert({
    where: { email: 'admin@enxtai.com' },
    update: {
      mustChangePassword: true, // Ensure existing users also require password reset
    },
    create: {
      email: 'admin@enxtai.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      mustChangePassword: true, // NEW: Force reset on first login
      // clientId is omitted for super admins (defaults to null)
    },
  });

  console.log('✅ Super admin created:');
  console.log('   Email: admin@enxtai.com');
  console.log('   Password: admin123');
  console.log('   Role: SUPER_ADMIN');
  console.log('   ⚠️  Must change password on first login');
  console.log('');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
