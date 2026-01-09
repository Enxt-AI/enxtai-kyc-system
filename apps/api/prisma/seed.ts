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

  // DEMO DATA: TestFinTech client for end-to-end testing. Delete in production.
  console.log('🏢 Creating demo client...');

  // Use deterministic UUID for demo client (allows upsert by id)
  const demoClientId = '00000000-0000-0000-0000-000000000001';

  // Generate API key using same pattern as ClientService.generateApiKey()
  const randomPart = randomBytes(32).toString('hex');
  const plaintextApiKey = `client_${randomPart}`;
  const hashedApiKey = createHash('sha256').update(plaintextApiKey).digest('hex');

  const demoClient = await prisma.client.upsert({
    where: { id: demoClientId },
    update: {},
    create: {
      id: demoClientId,
      name: 'TestFinTech',
      apiKey: hashedApiKey,
      apiKeyPlaintext: plaintextApiKey,
      status: 'ACTIVE',
      // Domain Whitelisting: Only allow API requests from these origins
      // - localhost:3000: Local development environment
      // - demo-client.ngrok.io: Demo ngrok tunnel for testing
      allowedDomains: ['localhost:3000', 'demo-client.ngrok.io'],
      // webhookUrl, webhookSecret, and config are optional and default to null
    },
  });

  console.log('✅ Demo client created:');
  console.log('   Name: TestFinTech');
  console.log('   API Key: ' + plaintextApiKey);
  console.log('   Status: ACTIVE');
  console.log('   Allowed Domains: localhost:3000, demo-client.ngrok.io');
  console.log('');

  // DEMO DATA: Client admin user for TestFinTech portal access
  console.log('👤 Creating demo client admin...');

  const clientAdminPassword = await bcrypt.hash('client123', 10);

  const demoClientAdmin = await prisma.clientUser.upsert({
    where: { email: 'admin@testfintech.com' },
    update: {
      mustChangePassword: true, // Ensure existing users also require password reset
    },
    create: {
      email: 'admin@testfintech.com',
      password: clientAdminPassword,
      role: 'ADMIN',
      clientId: demoClient.id,
      mustChangePassword: true, // NEW: Force reset on first login
    },
  });

  console.log('✅ Demo client admin created:');
  console.log('   Email: admin@testfintech.com');
  console.log('   Password: client123');
  console.log('   Role: ADMIN');
  console.log('   Client: TestFinTech');
  console.log('   ⚠️  Must change password on first login');
  console.log('');
  console.log('⚠️  DEMO DATA: Remove TestFinTech and admin@testfintech.com before production deployment!');
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
