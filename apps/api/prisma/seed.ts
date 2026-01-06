import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create super admin user
  const hashedPassword = await bcrypt.hash('admin123', 10);
  
  const admin = await prisma.clientUser.upsert({
    where: { email: 'admin@enxtai.com' },
    update: {},
    create: {
      email: 'admin@enxtai.com',
      password: hashedPassword,
      role: 'SUPER_ADMIN',
      // clientId is omitted for super admins (defaults to null)
    },
  });
  
  console.log('✅ Super admin created:');
  console.log('   Email: admin@enxtai.com');
  console.log('   Password: admin123');
  console.log('   Role: SUPER_ADMIN');
  console.log('');
  console.log('⚠️  IMPORTANT: Change this password in production!');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
