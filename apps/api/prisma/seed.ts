import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * Database Seed Script
 *
 * Seeds the database with:
 * 1. SUPER_ADMIN: Platform administrator (admin@enxtai.com) with null clientId
 * 2. Password Reset: Requires password change on first login
 *
 * ⚠️ SECURITY WARNING:
 * - Change admin password before production deployment
 */
async function main() {
  console.log('🌱 Seeding database...');

  // Create super admin clientUser
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@enxtai.com' },
    update: {
      mustChangePassword: true, // Ensure existing clientUsers also require password reset
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
